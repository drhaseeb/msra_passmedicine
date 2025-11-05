// Main App Object
const app = {
    // --- APP STATE ---
    textbookModal: null,
    loadingModal: null,
    
    // --- MODULE CONFIG ---
    msra: {
        allQuestions: [], // Will be populated with 3207 questions
        currentQuizSet: [],
        currentQuestionIndex: 0,
        progress: {}, // { "1_B_2093": "correct", ... }
        totalQuestions: 2960, // <-- FIX: Changed from 3207
        batchSize: 10,
        questionsPath: 'msra/questions/',
        textbookIndexPath: 'msra/textbook.html',
        textbookPath: 'msra/textbook/',
        textbookIndexContent: null,
        noteIdMap: {}, // To map '1_137' -> '1_137_Meningitis_CSF_analysis.html'
        // From textbook.html
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
        allQuestions: [], // Will be populated with 302 questions
        currentQuizSet: [],
        currentQuestionIndex: 0,
        progress: {},
        totalQuestions: 302,
        batchSize: 10,
        questionsPath: 'professional_dilemma/questions/',
        textbookIndexPath: 'professional_dilemma/textbook.html',
        textbookPath: 'professional_dilemma/textbook/',
        textbookIndexContent: null,
        noteIdMap: {}, // To map '1_958' -> '1_958_Post-exposure_prophylaxis.html'
        categories: {
             // From pd question JSON
            "1": "Professional Dilemmas"
        }
    },
    
    // --- INITIALIZATION ---
    init() {
        // This function runs on every page load
        
        // 1. Initialize modals (only if they exist on the page)
        const modalEl = document.getElementById('textbookModal');
        if (modalEl) {
            this.textbookModal = new bootstrap.Modal(modalEl);
        }
        const loadingModalEl = document.getElementById('loadingModal');
        if (loadingModalEl) {
            this.loadingModal = new bootstrap.Modal(loadingModalEl);
        }

        // 2. Register PWA service worker
        this.registerPWA();
        
        // 3. Setup all global click listeners
        this.initPageListeners();
        
        // 4. Run logic specific to the current page
        this.initPageLogic();
        
        // 5. Highlight the active link in the main navbar
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
            
            // --- Quiz Page Listeners ---
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
            
            // --- Shared Listeners ---

            // Answer Submission
            const submitBtn = e.target.closest('.submit-answer-btn');
            if (submitBtn) {
                e.preventDefault();
                const module = submitBtn.dataset.module;
                this.checkAnswer(module);
            }
            
            // SBA/Multi-choice Option selection
            const optionSelect = e.target.closest('.question-option');
            if (optionSelect && !optionSelect.hasAttribute('data-disabled')) {
                const module = optionSelect.closest('[data-module]').dataset.module;
                const qType = optionSelect.closest('[data-q-type]').dataset.qType;
                
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
            if(textbookLink) {
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
        // No logic needed for home, msra-home, or pd-home
    },

    updateActiveNavLink() {
        const pageId = document.body.id;
        document.querySelectorAll('.navbar-nav .nav-link').forEach(link => {
            const linkId = link.dataset.navId; // e.g., "msra" or "pd"
            if (pageId.includes(linkId)) {
                link.classList.add('active', 'fw-bold');
            }
        });
    },

    // --- QUIZ ENGINE LOGIC ---

    initQuizPage(module) {
        const config = this[module];
        const catSelect = document.getElementById(`${module}-category-select`);
        const catProgressList = document.getElementById(`${module}-category-progress`);
        
        // 1. Load progress from localStorage
        config.progress = this.loadProgress(module);

        // 2. Populate category dropdown
        if (catSelect.options.length <= 1) { // Only populate if empty
            for (const [id, name] of Object.entries(config.categories)) {
                const option = new Option(name, id);
                catSelect.add(option);
            }
        }

        // 3. Update all progress stats
        this.updateProgressUI(module);

        // 4. Pre-load textbook index for modal
        this.loadTextbookIndex(module);
    },

    updateProgressUI(module) {
        const config = this[module];
        const progress = config.progress;
        
        let correct = 0;
        let incorrect = 0;
        const categoryCounts = {}; // { "1": { correct: 0, incorrect: 0, total: 0 }, ... }
        
        // Initialize category counts
        for (const catId in config.categories) {
            categoryCounts[catId] = { correct: 0, incorrect: 0, total: 0 };
        }
        
        // Tally progress
        Object.values(progress).forEach(status => {
            if (status === 'correct') correct++;
            if (status === 'incorrect') incorrect++;
        });

        // We need all questions to tally category totals
        // This is a bit slow on first load, but fine on subsequent loads
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
                    if (data.total === 0) continue; // Skip empty categories
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

        // Update overall progress
        const totalAnswered = correct + incorrect;
        const totalRemaining = config.totalQuestions - totalAnswered;
        const correctPercent = (correct / config.totalQuestions) * 100;
        const incorrectPercent = (incorrect / config.totalQuestions) * 100;
        
        document.getElementById(`${module}-progress-bar-correct`).style.width = `${correctPercent}%`;
        document.getElementById(`${module}-progress-bar-incorrect`).style.width = `${incorrectPercent}%`;
        document.getElementById(`${module}-progress-text-correct`).innerHTML = `<i class="bi bi-check-circle-fill text-success"></i> ${correct} Correct`;
        document.getElementById(`${module}-progress-text-incorrect`).innerHTML = `<i class="bi bi-x-circle-fill text-danger"></i> ${incorrect} Incorrect`;
        document.getElementById(`${module}-progress-text-remaining`).innerHTML = `<i class="bi bi-circle"></i> ${totalRemaining} Remaining`;
    },

    async startQuiz(module) {
        const config = this[module];
        
        // Show loading modal
        document.getElementById('loading-modal-title').textContent = 'Loading Quiz...';
        document.getElementById('loading-modal-text').textContent = `Fetching all ${config.totalQuestions} questions. This is a one-time load.`;
        this.loadingModal.show();
        
        // 1. Load all questions (if not already loaded)
        await this.loadAllQuestions(module, true); // true = force decrypt if needed
        
        // 2. Get filters
        const categoryId = document.getElementById(`${module}-category-select`).value;
        const includeAnswered = document.getElementById(`${module}-include-answered`).checked;

        // 3. Filter questions
        let quizSet = config.allQuestions;
        
        if (categoryId !== 'all') {
            quizSet = quizSet.filter(q => String(q.category) === categoryId);
        }
        
        if (!includeAnswered) {
            quizSet = quizSet.filter(q => !config.progress.hasOwnProperty(q.question_id));
        }

        if (quizSet.length === 0) {
            this.loadingModal.hide();
            alert(includeAnswered ? "No questions found for this category." : "No unanswered questions remaining in this category!");
            return;
        }

        // 4. Setup quiz state
        config.currentQuizSet = quizSet;
        config.currentQuestionIndex = 0;

        // 5. Build question list sidebar
        const listEl = document.getElementById('quiz-question-list');
        listEl.innerHTML = '';
        quizSet.forEach((q, index) => {
            const el = document.createElement('a');
            el.href = '#';
            el.className = 'list-group-item list-group-item-action question-link';
            el.dataset.module = module;
            el.dataset.index = index;
            
            const status = config.progress[q.question_id];
            let icon = '<i class="bi bi-circle me-2"></i>';
            if (status === 'correct') {
                icon = '<i class="bi bi-check-circle-fill text-success me-2"></i>';
            } else if (status === 'incorrect') {
                icon = '<i class="bi bi-x-circle-fill text-danger me-2"></i>';
            }
            
            el.innerHTML = `
                <div class="d-flex justify-content-between align-items-center">
                    <span class="fw-bold">${icon} Question ${index + 1}</span>
                    <small class="text-secondary">${q.question_id}</small>
                </div>
            `;
            listEl.appendChild(el);
        });

        // 6. Show quiz view, hide setup view
        document.getElementById('quiz-setup-view').style.display = 'none';
        document.getElementById('quiz-viewer').style.display = 'flex';
        this.loadingModal.hide();
        
        // 7. Render first question
        this.renderQuizQuestion(module, 0);
    },

    finishQuiz() {
        // Show setup view, hide quiz view
        document.getElementById('quiz-setup-view').style.display = 'block';
        document.getElementById('quiz-viewer').style.display = 'none';

        // Update progress on the main page
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

        // Clamp index to bounds
        if (newIndex < 0) newIndex = 0;
        if (newIndex >= config.currentQuizSet.length) newIndex = config.currentQuizSet.length - 1;

        this.renderQuizQuestion(module, newIndex);
    },

    async loadAllQuestions(module, forceDecrypt = false) {
        const config = this[module];
        
        // Check if already loaded
        if (config.allQuestions.length === config.totalQuestions) {
            console.log(`[${module}] Questions already in memory.`);
            return;
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
                    // Decrypt each question *as it arrives*
                    .then(batchData => {
                        return batchData.map((q, index) => {
                            const questionIndex = start + index;
                            // Only decrypt if needed (e.g., first load) and if it's the MSRA module
                            if (module === 'msra' && forceDecrypt && typeof q.question === 'string') {
                                q.question = this.decryptText(q.question, questionIndex);
                                q.questions = q.questions.map(qs => this.decryptText(qs, questionIndex));
                            }
                            q.decrypted = true; // Mark as processed
                            return q;
                        });
                    })
            );
        }

        try {
            const allBatches = await Promise.all(fetchPromises);
            config.allQuestions = allBatches.flat();
            console.log(`[${module}] Successfully loaded and decrypted all ${config.allQuestions.length} questions.`);
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
        
        // Update question list active state
        document.querySelectorAll('#quiz-question-list .question-link').forEach((link, i) => {
            link.classList.toggle('active', i === index);
        });
        
        // Scroll active link into view
        const activeLink = document.querySelector('#quiz-question-list .question-link.active');
        if (activeLink) {
            activeLink.scrollIntoView({ block: 'nearest' });
        }

        // --- Decrypt on the fly if not already decrypted ---
        // This check is now redundant if forceDecrypt is always true on load, but good for safety.
        if (module === 'msra' && !q.decrypted) {
            // Re-finding the *original* 0-based index to get the key
            const originalIndex = config.allQuestions.findIndex(origQ => origQ.question_id === q.question_id);
            
            if (originalIndex !== -1) {
                 q.question = this.decryptText(q.question, originalIndex);
                 q.questions = q.questions.map(qs => this.decryptText(qs, originalIndex));
            }
        }
        q.decrypted = true; // Mark as processed
        
        const questionText = q.question.replace(/<br \/>/g, '<br>').replace(/<q>/g, '<blockquote class="border-start border-4 border-secondary ps-3 my-3 text-secondary">').replace(/<\/q>/g, '</blockquote>');

        let optionsHtml = '';
        const qType = String(q.question_type);

        switch(qType) {
            case "0": // SBA
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
            case "3": // Select 3
            case "5": // Select 2
                optionsHtml = q.options.slice(1, q.num_of_options + 1).map((opt, i) => {
                    if (!opt) return '';
                    return `<div class="question-option" data-letter="${alphabet[i]}">${alphabet[i]}. ${opt}</div>`;
                }).join('');
                break;
            default:
                optionsHtml = `<p class="text-danger">Error: Unknown question type "${q.question_type}"</p>`;
        }
        
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
        document.getElementById('quiz-nav-text').textContent = `Question ${index + 1} / ${config.currentQuizSet.length}`;
        document.getElementById('quiz-prev-btn').disabled = (index === 0);
        document.getElementById('quiz-next-btn').disabled = (index === config.currentQuizSet.length - 1);
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
            let answerString = "";
            inputs.forEach(input => { answerString += input.value.trim().toUpperCase(); });
            isCorrect = (answerString === q.correct_answer);

            inputs.forEach(input => {
                input.disabled = true;
                const correctRank = q.correct_answer.indexOf(input.dataset.letter) + 1;
                if (input.value == correctRank) input.classList.add('is-valid');
                else {
                    input.classList.add('is-invalid');
                    const hint = document.createElement('small');
                    hint.className = 'text-success ms-2';
                    hint.textContent = `(Correct: ${correctRank})`;
                    input.parentElement.appendChild(hint);
                }
            });
            
        } else if (qType === '3' || qType === '5') { // Select multiple
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
        this.saveProgress(module, q.question_id, isCorrect);
        
        // Update sidebar icon
        const link = document.querySelector(`#quiz-question-list .question-link[data-index="${config.currentQuestionIndex}"]`);
        if (link) {
            const icon = isCorrect ? '<i class="bi bi-check-circle-fill text-success me-2"></i>' : '<i class="bi bi-x-circle-fill text-danger me-2"></i>';
            link.innerHTML = link.innerHTML.replace(/<i class=".*?"><\/i>/, icon);
        }
    },

    restoreAnswerState(q, module) {
        // This function is for when a question is loaded that is *already* answered
        const qContainer = document.getElementById('quiz-question-area').firstElementChild;
        if (!qContainer) return;

        const qType = String(q.question_type);
        const status = this[module].progress[q.question_id];

        if (qType === '0') { // SBA
            qContainer.querySelectorAll('.question-option').forEach(opt => {
                opt.setAttribute('data-disabled', 'true');
                if (opt.dataset.index == q.correct_answer) {
                    opt.classList.add('correct');
                }
                // We don't know what they *selected*, only if they were wrong.
                // We'll just highlight the correct answer.
            });
        } else if (qType === '2') { // Ranking
             qContainer.querySelectorAll('.rank-input').forEach(input => {
                input.disabled = true;
                const correctRank = q.correct_answer.indexOf(input.dataset.letter) + 1;
                input.value = correctRank; // Just show the correct answer
                input.classList.add('is-valid');
             });
        } else if (qType === '3' || qType === '5') { // Select multiple
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

    saveProgress(module, questionId, isCorrect) {
        const config = this[module];
        const status = isCorrect ? 'correct' : 'incorrect';
        config.progress[questionId] = status;
        
        try {
            const key = `passMedProgress_${module}`;
            localStorage.setItem(key, JSON.stringify(config.progress));
        } catch (e) {
            console.error("Failed to save progress to localStorage:", e);
        }
    },

    loadProgress(module) {
        try {
            const key = `passMedProgress_${module}`;
            return JSON.parse(localStorage.getItem(key) || '{}');
        } catch (e) {
            console.error("Failed to load progress from localStorage:", e);
            return {};
        }
    },

    // --- DECRYPTION ---
    getDecryptionShift(key) {
        const shiftCalc = (key * key + key * key * key + key + 15) % 26;
        return 26 - shiftCalc;
    },

    decryptText(text, key) {
        if (!text || typeof text !== 'string') return text;
        const shift = this.getDecryptionShift(key);
        let decryptedText = "";
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const charCode = text.charCodeAt(i);
            if (65 <= charCode && charCode <= 90) { // Uppercase
                decryptedText += String.fromCharCode((charCode - 65 + shift) % 26 + 65);
            } else if (97 <= charCode && charCode <= 122) { // Lowercase
                decryptedText += String.fromCharCode((charCode - 97 + shift) % 26 + 97);
            } else {
                decryptedText += char;
            }
        }
        return decryptedText;
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
            if (navEl) {
                navEl.innerHTML = config.textbookIndexContent;
            }
            
            console.log(`[${module}] Textbook index loaded and Note ID Map created.`);
            
        } catch(err) {
            console.error(`Error loading textbook index for ${module}:`, err);
            if (navEl) navEl.innerHTML = `<p class="text-danger">Error: Could not load ${config.textbookIndexPath}.</p>`;
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
            this.textbookModal.show();
        } else {
            console.warn(`Could not find noteId ${noteId} in ${module} map. Trying to load index...`);
            this.loadTextbookIndex(module).then(() => {
                const newFilename = config.noteIdMap[noteId];
                if (newFilename) {
                    const newPath = `${config.textbookPath}${newFilename}`;
                    this.fetchAndRenderNote(newPath, '#textbookModalBody', noteId);
                    this.textbookModal.show();
                } else {
                    document.getElementById('textbookModalTitle').textContent = "Error";
                    document.getElementById('textbookModalBody').innerHTML = `<p class="text-danger">Could not find note with ID: ${noteId}.</p>`;
                    this.textbookModal.show();
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
