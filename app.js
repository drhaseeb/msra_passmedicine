// Main App Object
const app = {
    // --- APP STATE ---
    textbookModal: null,
    loadingModal: null,
    
    // --- MODULE CONFIG ---
    msra: {
        allQuestions: [], // Will be populated
        currentQuizSet: [],
        currentQuestionIndex: 0,
        // --- UPDATED PROGRESS STRUCTURE ---
        // Was: { "question_id": "correct" }
        // Now: { "question_id": { status: "correct", flagged: true } }
        progress: {}, 
        totalQuestions: 2960,
        batchSize: 10,
        questionsPath: 'msra/questions/',
        textbookIndexPath: 'msra/textbook.html',
        textbookPath: 'msra/textbook/',
        textbookIndexContent: null,
        noteIdMap: {}, // To map '1_137' -> '1_137_Meningitis_CSF_analysis.html'
        categories: {
            "1": "Cardiovascular",
            "2": "Dermatology / ENT / Eyes",
            "3": "Endocrinology / Metabolic",
            "4": "Gastroenterology / Nutrition",
            "5": "Infectious disease / Haematology / Immunology",
            "6": "Musculoskeletal",
            "7": "Paediatrics",
            "8": "Pharmacology and therapeutics",
            "9": "Psychiatry / Neurology",
            "10": "Renal / Urology",
            "11": "Reproductive",
            "12": "Respiratory"
        }
    },
    pd: {
        allQuestions: [],
        currentQuizSet: [],
        currentQuestionIndex: 0,
        // --- UPDATED PROGRESS STRUCTURE ---
        progress: {},
        totalQuestions: 302,
        batchSize: 10,
        questionsPath: 'professional_dilemma/questions/',
        textbookIndexPath: 'professional_dilemma/textbook.html',
        textbookPath: 'professional_dilemma/textbook/',
        textbookIndexContent: null,
        noteIdMap: {},
        categories: {
            "1": "Professional Dilemmas"
        }
    },

    // --- INITIALIZATION ---
    init() {
        // Initialize modals
        const modalEl = document.getElementById('textbookModal');
        if (modalEl) {
            this.textbookModal = new bootstrap.Modal(modalEl);
        }
        const loadingModalEl = document.getElementById('loadingModal');
        if (loadingModalEl) {
            this.loadingModal = new bootstrap.Modal(loadingModalEl);
        }

        // Register PWA service worker
        this.registerPWA();

        // Setup global click listeners
        this.initPageListeners();

        // Run page-specific logic
        this.initPageLogic();

        // Highlight active link in navbar
        this.updateActiveNavLink();
    },

    registerPWA() {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('./sw.js')
                    .then(registration => {
                        console.log('ServiceWorker registration successful with scope: ', registration.scope);
                    })
                    .catch(error => {
                        console.log('ServiceWorker registration failed: ', error);
                    });
            });
        }
    },

    initPageListeners() {
        document.body.addEventListener('click', (e) => {
            // Quiz Page Listeners
            const startQuizBtn = e.target.closest('#start-quiz-btn');
            if (startQuizBtn) {
                e.preventDefault();
                const module = startQuizBtn.dataset.module;
                this.startQuiz(module);
            }

            const quizNextBtn = e.target.closest('#quiz-next-btn');
            if (quizNextBtn) {
                e.preventDefault();
                this.navigateQuiz('next');
            }

            const quizPrevBtn = e.target.closest('#quiz-prev-btn');
            if (quizPrevBtn) {
                e.preventDefault();
                this.navigateQuiz('prev');
            }

            // --- NEW: Flag Button Listener ---
            const quizFlagBtn = e.target.closest('#quiz-flag-btn');
            if (quizFlagBtn) {
                e.preventDefault();
                this.toggleFlagQuestion();
            }

            // Combined listener for desktop and mobile finish buttons
            const quizFinishBtn = e.target.closest('#quiz-finish-btn, #quiz-finish-btn-desktop');
            if (quizFinishBtn) {
                e.preventDefault();
                this.finishQuiz();
            }

            // Combined listener for desktop and mobile question links
            const quizQuestionLink = e.target.closest('#quiz-question-list .question-link, #quiz-question-list-mobile .question-link');
            if (quizQuestionLink) {
                e.preventDefault();
                const index = parseInt(quizQuestionLink.dataset.index, 10);
                const module = quizQuestionLink.dataset.module;
                this.renderQuizQuestion(module, index);

                // Manually close offcanvas if it exists
                const offcanvasEl = quizQuestionLink.closest('.offcanvas');
                if (offcanvasEl) {
                    const bsOffcanvas = bootstrap.Offcanvas.getInstance(offcanvasEl);
                    if (bsOffcanvas) bsOffcanvas.hide();
                }
            }

            // Shared Listeners
            const submitBtn = e.target.closest('.submit-answer-btn');
            if (submitBtn) {
                e.preventDefault();
                const module = submitBtn.dataset.module;
                this.checkAnswer(module);
            }

            const optionSelect = e.target.closest('.question-option');
            if (optionSelect && !optionSelect.hasAttribute('data-disabled')) {
                const modEl = optionSelect.closest('[data-module]');
                const qtEl = optionSelect.closest('[data-q-type]');
                if (!modEl || !qtEl) return; // safety
                const module = modEl.dataset.module;
                const qType = qtEl.dataset.qType;

                if (qType === '0') { // SBA
                    optionSelect.parentElement.querySelectorAll('.question-option').forEach(opt => opt.classList.remove('selected'));
                    optionSelect.classList.add('selected');
                } else if (qType === '3' || qType === '5') { // "Choose 3" or "Choose 2"
                    optionSelect.classList.toggle('selected');
                }
            }

            // Textbook link from question
            const noteLink = e.target.closest('.question-note-link');
            if (noteLink) {
                e.preventDefault();
                const module = noteLink.dataset.module;
                const noteId = noteLink.dataset.noteId;
                this.showTextbookNote(module, noteId);
            }

            // Combined listener for desktop and mobile textbook links
            const textbookLink = e.target.closest('.textbook-sidebar a, #msra-textbook-nav-mobile a, #pd-textbook-nav-mobile a');
            if (textbookLink) {
                e.preventDefault();
                // Determine module from body ID as it's reliable
                const module = document.body.id.includes('msra') ? 'msra' : 'pd';
                this.handleTextbookNav(textbookLink, module);
                
                // Manually close offcanvas if it exists
                const offcanvasEl = textbookLink.closest('.offcanvas');
                if (offcanvasEl) {
                    const bsOffcanvas = bootstrap.Offcanvas.getInstance(offcanvasEl);
                    if (bsOffcanvas) bsOffcanvas.hide();
                }
            }
        });
    },

    initPageLogic() {
        const pageId = document.body.id;
        if (pageId === 'page-msra-questions') {
            this.initQuizPage('msra');
        } else if (pageId === 'page-pd-questions') {
            this.initQuizPage('pd');
        } else if (pageId === 'page-msra-textbook') {
            this.loadTextbookIndex('msra');
        } else if (pageId === 'page-pd-textbook') {
            this.loadTextbookIndex('pd');
        }
        // No logic needed for home pages
    },

    updateActiveNavLink() {
        const pageId = document.body.id;
        document.querySelectorAll('.navbar-nav .nav-link').forEach(link => {
            const linkId = link.dataset.navId;
            if (pageId.includes(linkId)) {
                link.classList.add('active', 'fw-bold');
            }
        });
    },

    // --- UTILITY ---
    /**
     * Shuffles an array in place using the Fisher-Yates algorithm.
     * @param {Array} array The array to shuffle.
     */
    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    },

    // --- QUIZ ENGINE LOGIC ---

    initQuizPage(module) {
        const config = this[module];
        const catSelect = document.getElementById(`${module}-category-select`);

        // Load progress from localStorage (and migrate if necessary)
        config.progress = this.loadProgress(module);

        // Populate category dropdown
        if (catSelect && catSelect.options.length <= 1) {
            for (const [id, name] of Object.entries(config.categories)) {
                const option = new Option(name, id);
                catSelect.add(option);
            }
        }
        this.updateProgressUI(module);
        this.loadTextbookIndex(module); // Pre-load textbook index

        // --- NEW: Add listener for quiz mode changes ---
        const radioButtons = document.querySelectorAll(`input[name="${module}-quiz-mode"]`);
        radioButtons.forEach(radio => {
            radio.addEventListener('change', (e) => {
                // Disable category select if "Flagged Only" is chosen
                if (catSelect) {
                    catSelect.disabled = (e.target.value === 'flagged');
                }
            });
        });
    },

    updateProgressUI(module) {
        const config = this[module];
        const progress = config.progress;
        let correct = 0, incorrect = 0, flagged = 0; // Added flagged count
        const categoryCounts = {};

        // Initialize category counts
        for (const catId in config.categories) {
            categoryCounts[catId] = { correct: 0, incorrect: 0, total: 0 };
        }

        // Tally progress from the new object structure
        Object.values(progress).forEach(entry => {
            if (entry.status === 'correct') correct++;
            if (entry.status === 'incorrect') incorrect++;
            if (entry.flagged) flagged++;
        });

        // Need questions loaded to tally per-category stats
        this.loadAllQuestions(module, false).then(() => {
            config.allQuestions.forEach(q => {
                const catId = String(q.category);
                if (categoryCounts[catId]) {
                    categoryCounts[catId].total++;
                    // Check status from new structure
                    const entry = progress[q.question_id];
                    if (entry) {
                        if (entry.status === 'correct') categoryCounts[catId].correct++;
                        if (entry.status === 'incorrect') categoryCounts[catId].incorrect++;
                    }
                }
            });

            // Render category progress
            const catProgressList = document.getElementById(`${module}-category-progress`);
            if (catProgressList) {
                catProgressList.innerHTML = '';
                for (const [id, data] of Object.entries(categoryCounts)) {
                    if (data.total === 0) continue;
                    const name = config.categories[id];
                    const answered = data.correct + data.incorrect;
                    const progressPercent = data.total > 0 ? (answered / data.total) * 100 : 0;

                    const li = document.createElement('li');
                    li.className = 'list-group-item';
                    li.innerHTML = `
                        <div class="d-flex justify-content-between mb-1">
                            <span class="text-light">${name}</span>
                            <span class="text-secondary">${answered} / ${data.total}</span>
                        </div>
                        <div class="progress">
                            <div class="progress-bar" role="progressbar" style="width: ${progressPercent}%" aria-valuenow="${progressPercent}" aria-valuemin="0" aria-valuemax="100"></div>
                        </div>
                    `;
                    catProgressList.appendChild(li);
                }
            }
        });

        // Update overall progress (with null checks)
        const correctPercent = (correct / config.totalQuestions) * 100;
        const incorrectPercent = (incorrect / config.totalQuestions) * 100;
        const totalAnswered = correct + incorrect;
        const totalRemaining = config.totalQuestions - totalAnswered;

        const barCorrect = document.getElementById(`${module}-progress-bar-correct`);
        const barIncorrect = document.getElementById(`${module}-progress-bar-incorrect`);
        if (barCorrect) barCorrect.style.width = `${correctPercent}%`;
        if (barIncorrect) barIncorrect.style.width = `${incorrectPercent}%`;

        const txtCorrect = document.getElementById(`${module}-progress-text-correct`);
        const txtIncorrect = document.getElementById(`${module}-progress-text-incorrect`);
        const txtRemaining = document.getElementById(`${module}-progress-text-remaining`);
        const txtFlagged = document.getElementById(`${module}-progress-text-flagged`); // Get new flagged element

        if (txtCorrect) txtCorrect.innerHTML = `<i class="bi bi-check-circle-fill text-success me-2"></i> ${correct} Correct`;
        if (txtIncorrect) txtIncorrect.innerHTML = `<i class="bi bi-x-circle-fill text-danger"></i> ${incorrect} Incorrect`;
        if (txtRemaining) txtRemaining.innerHTML = `<i class="bi bi-circle"></i> ${totalRemaining} Remaining`;
        if (txtFlagged) txtFlagged.innerHTML = `<i class="bi bi-flag-fill text-warning me-2"></i> ${flagged} Flagged`;
    },

    async startQuiz(module) {
        const config = this[module];
        const loadingModalEl = document.getElementById('loadingModal');

        // Main quiz logic
        const loadAndRenderQuiz = async () => {
            await this.loadAllQuestions(module);

            const categoryId = document.getElementById(`${module}-category-select`).value || 'all';
            // --- NEW: Get selected quiz mode ---
            const quizMode = document.querySelector(`input[name="${module}-quiz-mode"]:checked`).value || 'all';

            let quizSet = config.allQuestions;

            // --- NEW: Filter by Quiz Mode ---
            // Note: Flagged mode ignores category filter
            if (quizMode === 'flagged') {
                quizSet = config.allQuestions.filter(q => 
                    config.progress[q.question_id] && config.progress[q.question_id].flagged
                );
            } else {
                // 1. Filter by category (if not 'all')
                if (categoryId !== 'all') {
                    quizSet = quizSet.filter(q => String(q.category) === categoryId);
                }

                // 2. Filter by status (if not 'all')
                if (quizMode === 'unanswered') {
                    quizSet = quizSet.filter(q => 
                        !config.progress[q.question_id] || !config.progress[q.question_id].status
                    );
                } else if (quizMode === 'incorrect') {
                    quizSet = quizSet.filter(q => 
                        config.progress[q.question_id] && config.progress[q.question_id].status === 'incorrect'
                    );
                }
                // 'all' mode doesn't need a status filter
            }

            if (quizSet.length === 0) {
                if(this.loadingModal) this.loadingModal.hide();
                let msg = "No questions found for this criteria.";
                if (quizMode === 'flagged') msg = "You don't have any flagged questions.";
                else if (quizMode === 'incorrect') msg = "No incorrect questions found in this category.";
                else if (quizMode === 'unanswered') msg = "No unanswered questions remaining in this category!";
                
                alert(msg);
                return;
            }

            // --- SHUFFLE LOGIC ---
            // Shuffle the filtered set of questions
            this.shuffleArray(quizSet);
            // --- END SHUFFLE LOGIC ---

            config.currentQuizSet = quizSet;
            config.currentQuestionIndex = 0;

            // Get both desktop and mobile list elements
            const listElDesktop = document.getElementById('quiz-question-list');
            const listElMobile = document.getElementById('quiz-question-list-mobile');
            
            const questionLinks = [];
            quizSet.forEach((q, index) => {
                // --- NEW: Check progress entry for status and flag ---
                const entry = config.progress[q.question_id];
                const status = entry ? entry.status : null;
                const flagged = entry ? entry.flagged : false;

                let statusIcon = '<i class="bi bi-circle me-2"></i>';
                if (status === 'correct') {
                    statusIcon = '<i class="bi bi-check-circle-fill text-success me-2"></i>';
                } else if (status === 'incorrect') {
                    statusIcon = '<i class="bi bi-x-circle-fill text-danger me-2"></i>';
                }

                // Add flag icon if flagged
                let flagIcon = flagged ? '<i class="bi bi-flag-fill text-warning ms-auto"></i>' : '';

                questionLinks.push(`
                    <a href="#" class="list-group-item list-group-item-action question-link d-flex justify-content-between align-items-center" data-module="${module}" data-index="${index}">
                        <div class="d-flex align-items-center">
                            <span class="fw-bold">${statusIcon} Question ${index + 1}</span>
                        </div>
                        ${flagIcon}
                    </a>
                `);
            });

            const linksHtml = questionLinks.join('');
            if (listElDesktop) listElDesktop.innerHTML = linksHtml;
            if (listElMobile) listElMobile.innerHTML = linksHtml;


            // Show quiz view, hide setup view
            const setupViewEl = document.getElementById('quiz-setup-view');
            const quizViewerEl = document.getElementById('quiz-viewer');
            if(setupViewEl) setupViewEl.style.display = 'none';
            if(quizViewerEl) quizViewerEl.style.display = 'block'; // Use block, not flex, as flex is handled by media query

            // --- FIX ---
            // Check if modal objects exist before adding listeners or trying to hide.
            if(loadingModalEl && this.loadingModal) {
                // Add one-time listener to render first question after modal hidden
                loadingModalEl.addEventListener('hidden.bs.modal', () => {
                    this.renderQuizQuestion(module, 0);
                }, { once: true });
    
                // Hide loading modal at the end
                this.loadingModal.hide();
            } else {
                // If no modal, render immediately
                console.warn("No loading modal found, rendering question immediately.");
                this.renderQuizQuestion(module, 0);
            }
            // --- END FIX ---
        };

        // Setup modal text
        document.getElementById('loading-modal-title').textContent = 'Loading Quiz...';
        document.getElementById('loading-modal-text').textContent = `Fetching all ${config.totalQuestions} questions. This is a one-time load.`;

        // --- FIX ---
        // Add one-time listener for modal shown, with fallback
        if(loadingModalEl && this.loadingModal) {
            loadingModalEl.addEventListener('shown.bs.modal', loadAndRenderQuiz, { once: true });
            this.loadingModal.show();
        } else {
            // Fallback if modal isn't ready
            console.warn("Loading modal not found, running quiz loader directly.");
            loadAndRenderQuiz(); // This will now call renderQuizQuestion(0) at the end
        }
        // --- END FIX ---
    },

    finishQuiz() {
        // Show setup view, hide quiz view
        const setupViewEl = document.getElementById('quiz-setup-view');
        const quizViewerEl = document.getElementById('quiz-viewer');
        if(setupViewEl) setupViewEl.style.display = 'block';
        if(quizViewerEl) quizViewerEl.style.display = 'none';

        // Update progress
        const module = document.body.id.includes('msra') ? 'msra' : 'pd';
        this.updateProgressUI(module);
    },

    navigateQuiz(direction) {
        const module = document.body.id.includes('msra') ? 'msra' : 'pd';
        const config = this[module];
        let newIndex = config.currentQuestionIndex;

        if (direction === 'next') {
            newIndex++;
        } else if (direction === 'prev') {
            newIndex--;
        }

        if (newIndex < 0) newIndex = 0;
        if (newIndex >= config.currentQuizSet.length) newIndex = config.currentQuizSet.length - 1;

        this.renderQuizQuestion(module, newIndex);
    },

    async loadAllQuestions(module, forceDecrypt = false) {
        const config = this[module];

        // Already loaded?
        if (Array.isArray(config.allQuestions) && config.allQuestions.length === config.totalQuestions) {
            console.log(`[${module}] Questions already in memory.`);
            return Promise.resolve();
        }

        console.log(`[${module}] Loading all questions from scratch...`);
        const batchCount = Math.ceil(config.totalQuestions / config.batchSize);
        const fetchPromises = [];

        for (let i = 0; i < batchCount; i++) {
            const start = i * config.batchSize;
            const end = Math.min(start + config.batchSize - 1, config.totalQuestions - 1);
            const batchFile = `questions_${start}_to_${end}.json`;
            const path = `${config.questionsPath}${batchFile}`;

            fetchPromises.push(
                fetch(path)
                    .then(res => {
                        if (!res.ok) throw new Error(`Failed to load ${path}`);
                        return res.json();
                    })
                    .then(batchData => Array.isArray(batchData) ? batchData : [])
            );
        }

        try {
            const allBatches = await Promise.all(fetchPromises);
            config.allQuestions = allBatches.flat();
            console.log(`[${module}] Successfully loaded all ${config.allQuestions.length} questions.`);
        } catch (err) {
            console.error(`[${module}] Failed to load all questions:`, err);
            if(this.loadingModal) this.loadingModal.hide();
            alert(`Error loading all question files. Please check your local files and refresh. ${err.message}`);
        }
    },

    renderQuizQuestion(module, index) {
        const config = this[module];
        config.currentQuestionIndex = index;
        const q = config.currentQuizSet[index];
        const areaEl = document.getElementById(`quiz-question-area`);
        const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        if (!q || !areaEl) return;

        // Update question list active state for both desktop and mobile
        document.querySelectorAll('#quiz-question-list .question-link, #quiz-question-list-mobile .question-link').forEach((link) => {
            link.classList.toggle('active', parseInt(link.dataset.index, 10) === index);
        });

        // Scroll active link into view (for desktop)
        const activeLink = document.querySelector('#quiz-question-list .question-link.active');
        if (activeLink) activeLink.scrollIntoView({ block: 'nearest' });

        // Repaired truncated questionText logic
        let questionText = q.question || '';
        questionText = questionText
            .replace(/<br \/>/g, '<br>')
            .replace(/<q>/g, '<blockquote class="border-start border-4 border-secondary ps-3 my-3 text-secondary">')
            .replace(/<\/q>/g, '</blockquote>');

        let optionsHtml = '';
        const qType = String(q.question_type);

        // Clarify option slicing logic: skip index 0 if it's a dummy value, else use all
        // If q.options[0] is never used, keep slicing, else use all
        switch(qType) {
            case "0": // SBA (Single Best Answer)
                optionsHtml = q.options.slice(1, q.num_of_options + 1).map((opt, i) => {
                    if (!opt) return '';
                    return `<div class="question-option" data-index="${i + 1}">${opt}</div>`;
                }).join('');
                break;
            case "2": // Ranking
                optionsHtml = q.options.slice(1, q.num_of_options + 1).map((opt, i) => {
                    if (!opt) return '';
                    return `
                        <div class="d-flex align-items-center mb-2">
                            <input type="text" class="form-control rank-input" data-letter="${alphabet[i]}" maxlength="1">
                            <label>${alphabet[i]}. ${opt}</label>
                        </div>
                    `;
                }).join('');
                break;
            case "3":
            case "5": // Select Multiple
                optionsHtml = q.options.slice(1, q.num_of_options + 1).map((opt, i) => {
                    if (!opt) return '';
                    return `<div class="question-option" data-letter="${alphabet[i]}">${alphabet[i]}. ${opt}</div>`;
                }).join('');
                break;
            default:
                optionsHtml = `<p class="text-danger">Error: Unknown question type "${q.question_type}"</p>`;
        }

        // Check progress
        const entry = config.progress[q.question_id];
        const status = entry ? entry.status : null;

        areaEl.innerHTML = `
            <div data-module="${module}" data-q-type="${q.question_type}">
                <h4 class="text-light mb-4">${questionText}</h4>
                <div class="options-container mb-4">${optionsHtml}</div>
                <button class="btn btn-primary btn-lg submit-answer-btn" data-module="${module}" style="${status ? 'display: none;' : 'display: block;'}">Submit Answer</button>
                <div class="explanation-container mt-4"></div>
            </div>
        `;

        // If already answered, show explanation
        if (status) {
            this.restoreAnswerState(q, module);
            this.showExplanation(q, status === 'correct', module);
        }

        // Update nav
        const quizNavText = document.getElementById('quiz-nav-text');
        if (quizNavText) quizNavText.textContent = `Question ${index + 1} / ${config.currentQuizSet.length}`;
        const quizPrevBtn = document.getElementById('quiz-prev-btn');
        const quizNextBtn = document.getElementById('quiz-next-btn');
        if (quizPrevBtn) quizPrevBtn.disabled = (index === 0);
        if (quizNextBtn) quizNextBtn.disabled = (index === config.currentQuizSet.length - 1);

        // --- NEW: Update Flag Button State ---
        const flagBtn = document.getElementById('quiz-flag-btn');
        if (flagBtn) {
            const isFlagged = entry ? entry.flagged : false;
            flagBtn.classList.toggle('active', isFlagged); // 'active' class for visual state
            flagBtn.classList.toggle('text-warning', isFlagged);
            flagBtn.querySelector('i').className = isFlagged ? 'bi bi-flag-fill' : 'bi bi-flag';
        }
    },

    checkAnswer(module) {
        const qContainer = document.getElementById('quiz-question-area').firstElementChild;
        if (!qContainer) return;

        const qType = qContainer.dataset.qType;
        const config = this[module];
        const q = config.currentQuizSet[config.currentQuestionIndex];

        let isCorrect = false;

        if (qType === '0') { // SBA
            const selected = qContainer.querySelector('.question-option.selected');
            const answerIndex = selected ? selected.dataset.index : null;
            isCorrect = (answerIndex == q.correct_answer);

            qContainer.querySelectorAll('.question-option').forEach(opt => {
                opt.setAttribute('data-disabled', 'true');
                if (opt.dataset.index == q.correct_answer) opt.classList.add('correct');
                else if (opt.classList.contains('selected')) opt.classList.add('incorrect');
            });

        } else if (qType === '2') { // Ranking
            const inputs = qContainer.querySelectorAll('.rank-input');
            
            // --- LOGIC FIX ---
            // Build the user's answer string by sorting the letters based on the rank provided
            let ranks = [];
            inputs.forEach(input => {
                ranks.push({
                    letter: input.dataset.letter,
                    rank: parseInt(input.value.trim(), 10) || 0 // Get the number
                });
            });
            // Sort by the rank the user entered
            ranks.sort((a, b) => a.rank - b.rank);
            // Create the answer string from the letters in the user-ranked order
            let answerString = ranks.map(r => r.letter).join('');
            isCorrect = (answerString === q.correct_answer);
            // --- END LOGIC FIX ---

            inputs.forEach(input => {
                input.disabled = true;
                const correctRank = q.correct_answer.indexOf(input.dataset.letter) + 1;
                // Show correct answer position for each letter
                if (input.value.trim() === String(correctRank)) { 
                    input.classList.add('is-valid');
                } else {
                    input.classList.add('is-invalid');
                    const hint = document.createElement('small');
                    hint.className = 'text-success ms-2';
                    hint.textContent = `(Correct: ${correctRank})`;
                    input.parentElement.appendChild(hint);
                }
            });

        } else if (qType === '3' || qType === '5') { // Select Multiple
            const selected = qContainer.querySelectorAll('.question-option.selected');
            let answerString = Array.from(selected).map(opt => opt.dataset.letter).sort().join('');
            let correctAnswer = q.correct_answer.split('').sort().join('');
            isCorrect = (answerString === correctAnswer);

            const correctLetters = q.correct_answer.split('');
            qContainer.querySelectorAll('.question-option').forEach(opt => {
                opt.setAttribute('data-disabled', 'true');
                if (correctLetters.includes(opt.dataset.letter)) opt.classList.add('correct');
                else if (opt.classList.contains('selected')) opt.classList.add('incorrect');
            });
        }

        qContainer.querySelector('.submit-answer-btn').style.display = 'none';
        this.showExplanation(q, isCorrect, module);
        
        // --- NEW: Update progress object ---
        const status = isCorrect ? 'correct' : 'incorrect';
        const entry = config.progress[q.question_id] || { status: null, flagged: false };
        entry.status = status;
        config.progress[q.question_id] = entry;
        this.saveProgress(module); // Save entire progress object

        // --- NEW: Update sidebar icon (respecting flag) ---
        this.updateQuestionListIcon(module, q.question_id, status, entry.flagged);
    },

    restoreAnswerState(q, module) {
        const qContainer = document.getElementById('quiz-question-area').firstElementChild;
        if (!qContainer) return;

        const qType = String(q.question_type);

        if (qType === '0') { // SBA
            qContainer.querySelectorAll('.question-option').forEach(opt => {
                opt.setAttribute('data-disabled', 'true');
                if (opt.dataset.index == q.correct_answer) {
                    opt.classList.add('correct');
                }
            });
        } else if (qType === '2') { // Ranking
            qContainer.querySelectorAll('.rank-input').forEach(input => {
                input.disabled = true;
                const correctRank = q.correct_answer.indexOf(input.dataset.letter) + 1;
                input.value = correctRank;
                input.classList.add('is-valid');
            });
        } else if (qType === '3' || qType === '5') { // Select Multiple
            const correctLetters = q.correct_answer.split('');
            qContainer.querySelectorAll('.question-option').forEach(opt => {
                opt.setAttribute('data-disabled', 'true');
                if (correctLetters.includes(opt.dataset.letter)) {
                    opt.classList.add('correct');
                }
            });
        }
    },

    showExplanation(q, isCorrect, module) {
        const container = document.querySelector(`#quiz-question-area .explanation-container`);
        if (!container) return;

        let noteLinkHtml = '';
        if (q.notes_id_link && q.notes_id_link !== "0" && q.notes_id_link !== "1_1827") {
            noteLinkHtml = `<button class="btn btn-outline-info mt-3 question-note-link" data-module="${module}" data-note-id="${q.notes_id_link}">
                <i class="bi bi-book-half me-2"></i>View Linked Textbook Note
            </button>`;
        }

        container.innerHTML = `
            <div class="question-explanation">
                <h4 class="text-light">${isCorrect ? '<i class="bi bi-check-circle-fill text-success me-2"></i>Correct' : '<i class="bi bi-x-circle-fill text-danger me-2"></i>Incorrect'}</h4>
                <hr class="my-3 border-secondary">
                <div class="fs-5">${q.question_notes}</div>
                ${noteLinkHtml}
            </div>
        `;
    },

    // --- NEW: Toggles the flag for the current question ---
    toggleFlagQuestion() {
        const module = document.body.id.includes('msra') ? 'msra' : 'pd';
        const config = this[module];
        if (!config || !config.currentQuizSet[config.currentQuestionIndex]) return;

        const q = config.currentQuizSet[config.currentQuestionIndex];
        const questionId = q.question_id;

        // Get or create progress entry
        const entry = config.progress[questionId] || { status: null, flagged: false };
        // Toggle flag
        entry.flagged = !entry.flagged;
        config.progress[questionId] = entry;
        
        // Save the whole progress object
        this.saveProgress(module);

        // Update the UI (button and list)
        this.updateFlaggedUI(module, questionId, entry.flagged);
    },

    // --- NEW: Updates the UI elements for a question's flag state ---
    updateFlaggedUI(module, questionId, isFlagged) {
        const config = this[module];

        // Update the main flag button if this is the current question
        const q = config.currentQuizSet[config.currentQuestionIndex];
        if (q && q.question_id === questionId) {
            const flagBtn = document.getElementById('quiz-flag-btn');
            if (flagBtn) {
                flagBtn.classList.toggle('active', isFlagged);
                flagBtn.classList.toggle('text-warning', isFlagged);
                flagBtn.querySelector('i').className = isFlagged ? 'bi bi-flag-fill' : 'bi bi-flag';
            }
        }

        // Update the icon in the question list (desktop and mobile)
        const entry = config.progress[questionId];
        const status = entry ? entry.status : null;
        this.updateQuestionListIcon(module, questionId, status, isFlagged);
    },

    // --- NEW: Updates a single question's icon in the list ---
    updateQuestionListIcon(module, questionId, status, isFlagged) {
        const config = this[module];
        const index = config.currentQuizSet.findIndex(q => q.question_id === questionId);
        if (index === -1) return; // Not in the current quiz set

        let statusIcon = '<i class="bi bi-circle me-2"></i>';
        if (status === 'correct') {
            statusIcon = '<i class="bi bi-check-circle-fill text-success me-2"></i>';
        } else if (status === 'incorrect') {
            statusIcon = '<i class="bi bi-x-circle-fill text-danger me-2"></i>';
        }

        let flagIcon = isFlagged ? '<i class="bi bi-flag-fill text-warning ms-auto"></i>' : '';

        const linkSelector = `.question-link[data-index="${index}"]`;
        document.querySelectorAll(linkSelector).forEach(link => {
            if (link) {
                link.innerHTML = `
                    <div class="d-flex align-items-center">
                        <span class="fw-bold">${statusIcon} Question ${index + 1}</span>
                    </div>
                    ${flagIcon}
                `;
            }
        });
    },


    // --- UPDATED: saveProgress now saves the *entire* progress object ---
    saveProgress(module) {
        const config = this[module];
        try {
            const key = `passMedProgress_${module}`;
            localStorage.setItem(key, JSON.stringify(config.progress));
        } catch (e) {
            console.error("Failed to save progress to localStorage:", e);
            // alert("Unable to save progress. Storage error.");
        }
    },

    // --- UPDATED: loadProgress now handles data migration ---
    loadProgress(module) {
        try {
            const key = `passMedProgress_${module}`;
            const storedProgress = JSON.parse(localStorage.getItem(key) || '{}');
            
            // --- Migration Logic ---
            let needsSave = false;
            const migratedProgress = {};
            
            for (const questionId in storedProgress) {
                const value = storedProgress[questionId];
                if (typeof value === 'string') {
                    // This is the OLD format ("question_id": "correct")
                    migratedProgress[questionId] = {
                        status: value, // 'correct' or 'incorrect'
                        flagged: false
                    };
                    needsSave = true;
                } else if (typeof value === 'object' && value !== null && (value.hasOwnProperty('status') || value.hasOwnProperty('flagged'))) {
                    // This is the NEW format
                    migratedProgress[questionId] = value;
                }
            }

            if (needsSave) {
                console.log(`[${module}] Migrated progress data to new format.`);
                // Save the migrated data back to localStorage immediately
                localStorage.setItem(key, JSON.stringify(migratedProgress));
            }
            // --- End Migration Logic ---

            return migratedProgress;

        } catch (e) {
            console.error("Failed to load/migrate progress from localStorage:", e);
            // alert("Unable to load progress. Storage error.");
            return {};
        }
    },

    // --- TEXTBOOK LOGIC ---
    async loadTextbookIndex(module) {
        const config = this[module];
        // Get both desktop and mobile nav elements
        const navElDesktop = document.getElementById(`${module}-textbook-nav`);
        const navElMobile = document.getElementById(`${module}-textbook-nav-mobile`);

        if (config.textbookIndexContent) {
            if (navElDesktop) navElDesktop.innerHTML = config.textbookIndexContent;
            if (navElMobile) navElMobile.innerHTML = config.textbookIndexContent;
            return;
        }

        try {
            const response = await fetch(config.textbookIndexPath);
            if (!response.ok) throw new Error(`File not found: ${config.textbookIndexPath}`);

            const html = await response.text();

            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const links = doc.querySelectorAll('a');

            links.forEach(link => {
                const href = link.getAttribute('href');
                if (!href) return;

                const filename = href.split('/').pop();
                const match = filename.match(/^([0-9]+_[0-9]+)_/);

                if (match) {
                    const noteId = match[1];
                    config.noteIdMap[noteId] = filename;
                    const correctPath = `${config.textbookPath}${filename}`;
                    link.setAttribute('href', '#');
                    link.setAttribute('data-path', correctPath);
                    link.removeAttribute('target');
                } else {
                    link.setAttribute('data-path', '');
                }
            });

            config.textbookIndexContent = doc.body.innerHTML;
            if (navElDesktop) navElDesktop.innerHTML = config.textbookIndexContent;
            if (navElMobile) navElMobile.innerHTML = config.textbookIndexContent;

            console.log(`[${module}] Textbook index loaded and Note ID Map created.`);
        } catch(err) {
            console.error(`Error loading textbook index for ${module}:`, err);
            const errorMsg = `<p class="text-danger">Error: Could not load ${config.textbookIndexPath}.</p>`;
            if (navElDesktop) navElDesktop.innerHTML = errorMsg;
            if (navElMobile) navElMobile.innerHTML = errorMsg;
        }
    },

    handleTextbookNav(link, module) {
        const path = link.dataset.path;
        if (path) {
            this.fetchAndRenderNote(path, `#${module}-textbook-area`);
        } else if (link.getAttribute('href').startsWith('#')) {
            const targetId = link.getAttribute('href').substring(1);
            const targetElement = document.getElementById(targetId);
            if (targetElement) {
                targetElement.scrollIntoView({ behavior: 'smooth' });
            }
        }
    },

    showTextbookNote(module, noteId) {
        const config = this[module];
        const filename = config.noteIdMap[noteId];

        if (filename) {
            const path = `${config.textbookPath}${filename}`;
            this.fetchAndRenderNote(path, '#textbookModalBody', noteId);
            if(this.textbookModal) this.textbookModal.show();
        } else {
            console.warn(`Could not find noteId ${noteId} in ${module} map. Trying to load index...`);
            this.loadTextbookIndex(module).then(() => {
                const newFilename = config.noteIdMap[noteId];
                if (newFilename) {
                    const newPath = `${config.textbookPath}${newFilename}`;
                    this.fetchAndRenderNote(newPath, '#textbookModalBody', noteId);
                    if(this.textbookModal) this.textbookModal.show();
                } else {
                    document.getElementById('textbookModalTitle').textContent = "Error";
                    document.getElementById('textbookModalBody').innerHTML = `<p class="text-danger">Could not find note with ID: ${noteId}.</p>`;
                    if(this.textbookModal) this.textbookModal.show();
                }
            });
        }
    },

    async fetchAndRenderNote(path, targetSelector, noteId) {
        const targetEl = document.querySelector(targetSelector);
        if (!targetEl) return;

        targetEl.innerHTML = `<h2 class="text-secondary">Loading note...</h2>`;
        if (noteId) document.getElementById('textbookModalTitle').textContent = `Loading...`;

        try {
            const response = await fetch(path);
            if (!response.ok) throw new Error(`File not found: ${path}`);

            let content = await response.text();

            try {
                // This is the hybrid approach: try to parse as JSON first
                const data = JSON.parse(content);
                if (Array.isArray(data) && data.length > 0) {
                    const note = data[0];
                    content = `
                        <h1 class="text-light mb-4">${note.title}</h1>
                        ${note.body}
                        <hr class="my-4 border-secondary">
                        <h4 class="text-light">Links</h4>
                        ${note.links || '<p class="text-secondary">No links available.</p>'}
                        <h4 class="text-light mt-4">Media</h4>
                        ${note.media || '<p class="text-secondary">No media available.</p>'}
                    `;
                    if (noteId) {
                        document.getElementById('textbookModalTitle').textContent = note.title;
                    }
                }
            } catch (jsonError) {
                // If JSON fails, treat as plain HTML
                console.warn(`Could not parse JSON from ${path}, treating as plain HTML.`);
                if (noteId) {
                    document.getElementById('textbookModalTitle').textContent = path.split('/').pop().replace(/_/g, ' ').replace('.html', '');
                }
            }

            targetEl.innerHTML = content;
        } catch (err) {
            console.error('Error fetching note:', err);
            targetEl.innerHTML = `<h2 class="text-danger">Error: Could not load note from ${path}</h2>`;
            if (noteId) document.getElementById('textbookModalTitle').textContent = "Error";
        }
    }
};

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    app.init();
});
