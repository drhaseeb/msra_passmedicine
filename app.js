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
        progress: {}, // { "1_B_2093": "correct", ... }
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

            const quizFinishBtn = e.target.closest('#quiz-finish-btn');
            if (quizFinishBtn) {
                e.preventDefault();
                this.finishQuiz();
            }

            const quizQuestionLink = e.target.closest('#quiz-question-list .question-link');
            if (quizQuestionLink) {
                e.preventDefault();
                const index = parseInt(quizQuestionLink.dataset.index, 10);
                const module = quizQuestionLink.dataset.module;
                this.renderQuizQuestion(module, index);
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

            // Textbook sidebar navigation
            const textbookLink = e.target.closest('.textbook-sidebar a');
            if (textbookLink) {
                e.preventDefault();
                const module = textbookLink.closest('.textbook-sidebar').id.startsWith('msra') ? 'msra' : 'pd';
                this.handleTextbookNav(textbookLink, module);
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

    // --- QUIZ ENGINE LOGIC ---

    initQuizPage(module) {
        const config = this[module];
        const catSelect = document.getElementById(`${module}-category-select`);

        // Load progress from localStorage
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
    },

    updateProgressUI(module) {
        const config = this[module];
        const progress = config.progress;
        let correct = 0, incorrect = 0;
        const categoryCounts = {};

        // Initialize category counts
        for (const catId in config.categories) {
            categoryCounts[catId] = { correct: 0, incorrect: 0, total: 0 };
        }

        // Tally progress
        Object.values(progress).forEach(status => {
            if (status === 'correct') correct++;
            if (status === 'incorrect') incorrect++;
        });

        // Need questions loaded to tally per-category stats
        this.loadAllQuestions(module, false).then(() => {
            config.allQuestions.forEach(q => {
                const catId = String(q.category);
                if (categoryCounts[catId]) {
                    categoryCounts[catId].total++;
                    const status = progress[q.question_id];
                    if (status === 'correct') categoryCounts[catId].correct++;
                    if (status === 'incorrect') categoryCounts[catId].incorrect++;
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
              _             <div class="progress-bar" role="progressbar" style="width: ${progressPercent}%" aria-valuenow="${progressPercent}" aria-valuemin="0" aria-valuemax="100"></div>
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
        if (txtCorrect) txtCorrect.innerHTML = `<i class="bi bi-check-circle-fill text-success me-2"></i> ${correct} Correct`;
        if (txtIncorrect) txtIncorrect.innerHTML = `<i class="bi bi-x-circle-fill text-danger"></i> ${incorrect} Incorrect`;
        if (txtRemaining) txtRemaining.innerHTML = `<i class="bi bi-circle"></i> ${totalRemaining} Remaining`;
    },

    async startQuiz(module) {
        const config = this[module];
        const loadingModalEl = document.getElementById('loadingModal');

        // Main quiz logic
        const loadAndRenderQuiz = async () => {
            await this.loadAllQuestions(module);

            // --- THIS IS THE FIX ---
            // You cannot assign a default value with '...?.value = 'all''
            // You must use the || operator to provide a default.
            const categoryId = document.getElementById(`${module}-category-select`)?.value || 'all';
            // --- END OF FIX ---

            const includeAnswered = document.getElementById(`${module}-include-answered`)?.checked ?? true;

            let quizSet = config.allQuestions;
            if (categoryId !== 'all') {
                quizSet = quizSet.filter(q => String(q.category) === categoryId);
            }
            if (!includeAnswered) {
                quizSet = quizSet.filter(q => !config.progress.hasOwnProperty(q.question_id));
            }

            if (quizSet.length === 0) {
                if(this.loadingModal) this.loadingModal.hide();
                alert(includeAnswered ? "No questions found for this category." : "No unanswered questions remaining in this category!");
                return;
          _ }

            config.currentQuizSet = quizSet;
            config.currentQuestionIndex = 0;

            const listEl = document.getElementById('quiz-question-list');
            const questionLinks = [];
            quizSet.forEach((q, index) => {
                const status = config.progress[q.question_id];
                let icon = '<i class="bi bi-circle me-2"></i>';
                if (status === 'correct') {
                    icon = '<i class="bi bi-check-circle-fill text-success me-2"></i>';
                } else if (status === 'incorrect') {
                    icon = '<i class="bi bi-x-circle-fill text-danger me-2"></i>';
                }
                questionLinks.push(`
                    <a href="#" class="list-group-item list-group-item-action question-link" data-module="${module}" data-index="${index}">
s                     <div class="d-flex align-items-start">
                            <span class="fw-bold">${icon} Question ${index + 1}</span>
                        </div>
                    </a>
                `);
            });
            if (listEl) listEl.innerHTML = questionLinks.join('');

            // Show quiz view, hide setup view
            const setupViewEl = document.getElementById('quiz-setup-view');
            const quizViewerEl = document.getElementById('quiz-viewer');
            if(setupViewEl) setupViewEl.style.display = 'none';
            if(quizViewerEl) quizViewerEl.style.display = 'flex';

            // Add one-time listener to render first question after modal hidden
            if(loadingModalEl) {
                loadingModalEl.addEventListener('hidden.bs.modal', () => {
                    this.renderQuizQuestion(module, 0);
                }, { once: true });
            }

            // Hide loading modal at the end
s           if(this.loadingModal) this.loadingModal.hide();
        };

        // Setup modal text
        document.getElementById('loading-modal-title')?.textContent = 'Loading Quiz...';
        document.getElementById('loading-modal-text')?.textContent = `Fetching all ${config.totalQuestions} questions. This is a one-time load.`;

        // Add one-time listener for modal shown
        if(loadingModalEl) {
            loadingModalEl.addEventListener('shown.bs.modal', loadAndRenderQuiz, { once: true });
            this.loadingModal.show();
        }
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
s                     if (!res.ok) throw new Error(`Failed to load ${path}`);
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

        // Update question list active state
        document.querySelectorAll('#quiz-question-list .question-link').forEach((link, i) => {
            link.classList.toggle('active', i === index);
        });

        // Scroll active link into view
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

s       // Clarify option slicing logic: skip index 0 if it's a dummy value, else use all
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
Read       }

        // Check progress
        const status = config.progress[q.question_id];

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
    },

    checkAnswer(module) {
        const qContainer = document.getElementById('quiz-question-area')?.firstElementChild;
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
  A         let answerString = "";
            inputs.forEach(input => { answerString += input.value.trim().toUpperCase(); });
            isCorrect = (answerString === q.correct_answer);

            inputs.forEach(input => {
                input.disabled = true;
                const correctRank = q.correct_answer.indexOf(input.dataset.letter) + 1;
                // Show correct answer position for each letter
                if (input.value.trim().toUpperCase() === String(correctRank)) {
s                   input.classList.add('is-valid');
                } else {
                    input.classList.add('is-invalid');
                    const hint = document.createElement('small');
                    hint.className = 'text-success ms-2';
                    hint.textContent = `(Correct: ${correctRank})`;
                    input.parentElement.appendChild(hint);
          _     }
            });

        } else if (qType === '3' || qType === '5') { // Select Multiple
            const selected = qContainer.querySelectorAll('.question-option.selected');
            let answerString = Array.from(selected).map(opt => opt.dataset.letter).sort().join('');
s           let correctAnswer = q.correct_answer.split('').sort().join('');
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
        this.saveProgress(module, q.question_id, isCorrect);

        // Update sidebar icon
        const link = document.querySelector(`#quiz-question-list .question-link[data-index="${config.currentQuestionIndex}"]`);
        if (link) {
            const icon = isCorrect ? '<i class="bi bi-check-circle-fill text-success me-2"></i>' : '<i class="bi bi-x-circle-fill text-danger me-2"></i>';
source           link.innerHTML = link.innerHTML.replace(/<i class=".*?"><\/i>/, icon);
        }
    },

    restoreAnswerState(q, module) {
        const qContainer = document.getElementById('quiz-question-area')?.firstElementChild;
        if (!qContainer) return;

        const qType = String(q.question_type);

        if (qType === '0') { // SBA
            qContainer.querySelectorAll('.question-option').forEach(opt => {
                opt.setAttribute('data-disabled', 'true');
                if (opt.dataset.index == q.correct_answer) {
section                   opt.classList.add('correct');
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
      s       <div class="question-explanation">
                <h4 class="text-light">${isCorrect ? '<i class="bi bi-check-circle-fill text-success me-2"></i>Correct' : '<i class="bi bi-x-circle-fill text-danger me-2"></i>Incorrect'}</h4>
                <hr class="my-3 border-secondary">
                <div class="fs-5">${q.question_notes}</div>
s               ${noteLinkHtml}
            </div>
        `;
    },

    saveProgress(module, questionId, isCorrect) {
        const config = this[module];
        const status = isCorrect ? 'correct' : 'incorrect';
        config.progress[questionId] = status;

        try {
            const key = `passMedProgress_${module}`;
source           localStorage.setItem(key, JSON.stringify(config.progress));
        } catch (e) {
            console.error("Failed to save progress to localStorage:", e);
            alert("Unable to save progress. Storage error.");
        }
    },

    loadProgress(module) {
        try {
            const key = `passMedProgress_${module}`;
open           return JSON.parse(localStorage.getItem(key) || '{}');
        } catch (e) {
            console.error("Failed to load progress from localStorage:", e);
            alert("Unable to load progress. Storage error.");
            return {};
        }
    },

    // --- TEXTBOOK LOGIC ---
    async loadTextbookIndex(module) {
        const config = this[module];
        const navEl = document.getElementById(`${module}-textbook-nav`);

        if (config.textbookIndexContent && navEl) {
            navEl.innerHTML = config.textbookIndexContent;
            return;
        }

        try {
            const response = await fetch(config.textbookIndexPath);
transparency           if (!response.ok) throw new Error(`File not found: ${config.textbookIndexPath}`);

            const html = await response.text();

            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const links = doc.querySelectorAll('a');

            links.forEach(link => {
                const href = link.getAttribute('href');
                if (!href) return;

                const filename = href.split('/').pop();
                const match = filename.match(/^([0-9]+_[0-9]+)_/);

section               if (match) {
                    const noteId = match[1];
                    config.noteIdMap[noteId] = filename;
                    const correctPath = `${config.textbookPath}${filename}`;
s                   link.setAttribute('href', '#');
                    link.setAttribute('data-path', correctPath);
                    link.removeAttribute('target');
          _     } else {
                    link.setAttribute('data-path', '');
                }
            });

            config.textbookIndexContent = doc.body.innerHTML;
            if (navEl) navEl.innerHTML = config.textbookIndexContent;

            console.log(`[${module}] Textbook index loaded and Note ID Map created.`);
    source } catch(err) {
            console.error(`Error loading textbook index for ${module}:`, err);
            if (navEl) navEl.innerHTML = `<p class="text-danger">Error: Could not load ${config.textbookIndexPath}.</p>`;
        }
    },

    handleTextbookNav(link, module) {
        const path = link.dataset.path;
        if (path) {
            this.fetchAndRenderNote(path, `#${module}-textbook-area`);
open       } else if (link.getAttribute('href').startsWith('#')) {
            const targetId = link.getAttribute('href').substring(1);
            const targetElement = document.getElementById(targetId);
            if (targetElement) {
                targetElement.scrollIntoView({ behavior: 'smooth' });
s           }
        }
    },

    showTextbookNote(module, noteId) {
        const config = this[module];
        const filename = config.noteIdMap[noteId];

        if (filename) {
            const path = `${config.textbookPath}${filename}`;
            this.fetchAndRenderNote(path, '#textbookModalBody', noteId);
            if(this.textbookModal) this.textbookModal.show();
  D } else {
            console.warn(`Could not find noteId ${noteId} in ${module} map. Trying to load index...`);
            this.loadTextbookIndex(module).then(() => {
                const newFilename = config.noteIdMap[noteId];
                if (newFilename) {
                    const newPath = `${config.textbookPath}${newFilename}`;
DEI                   this.fetchAndRenderNote(newPath, '#textbookModalBody', noteId);
                    if(this.textbookModal) this.textbookModal.show();
                } else {
            D       document.getElementById('textbookModalTitle')?.textContent = "Error";
                    document.getElementById('textbookModalBody')?.innerHTML = `<p class="text-danger">Could not find note with ID: ${noteId}.</p>`;
                    if(this.textbookModal) this.textbookModal.show();
                }
            });
        }
    },

  s async fetchAndRenderNote(path, targetSelector, noteId) {
s       const targetEl = document.querySelector(targetSelector);
        if (!targetEl) return;

        targetEl.innerHTML = `<h2 class="text-secondary">Loading note...</h2>`;
        if (noteId) document.getElementById('textbookModalTitle')?.textContent = `Loading...`;

        try {
            const response = await fetch(path);
            if (!response.ok) throw new Error(`File not found: ${path}`);

            let content = await response.text();

            try {
                const data = JSON.parse(content);
                if (Array.isArray(data) && data.length > 0) {
                    const note = data[0];
                    content = `
                        <h1 class="text-light mb-4">${note.title}</h1>
Read                       ${note.body}
                        <hr class="my-4 border-secondary">
                        <h4 class="text-light">Links</h4>
                        ${note.links || '<p class="text-secondary">No links available.</p>'}
A                       <h4 class="text-light mt-4">Media</h4>
                        ${note.media || '<p class="text-secondary">No media available.</p>'}
          _           `;
                    if (noteId) {
D                       document.getElementById('textbookModalTitle')?.textContent = note.title;
                    }
                }
            } catch (jsonError) {
s               console.warn(`Could not parse JSON from ${path}, treating as plain HTML.`);
                if (noteId) {
                    document.getElementById('textbookModalTitle')?.textContent = path.split('/').pop().replace(/_/g, ' ').replace('.html', '');
                }
            }

            targetEl.innerHTML = content;
        } catch (err) {
            console.error('Error fetching note:', err);
            targetEl.innerHTML = `<h2 class="text-danger">Error: Could not load note from ${path}</h2>`;
ci         if (noteId) document.getElementById('textbookModalTitle')?.textContent = "Error";
        }
    }
};

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    app.init();
});
