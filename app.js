// Main App Object
const app = {
    textbookModal: null,
    msra: {
        currentBatchData: [],
        totalQuestions: 3207,
        batchSize: 10,
        questionsPath: 'msra/questions/',
        textbookIndexPath: 'msra/textbook.html',
        textbookPath: 'msra/textbook/',
        textbookIndexContent: null,
        noteIdMap: {}, // To map '1_137' -> '1_137_Meningitis_CSF_analysis.html'
    },
    pd: {
        currentBatchData: [],
        totalQuestions: 302,
        batchSize: 10,
        questionsPath: 'professional_dilemma/questions/',
        textbookIndexPath: 'professional_dilemma/textbook.html',
        textbookPath: 'professional_dilemma/textbook/',
        textbookIndexContent: null,
        noteIdMap: {}, // To map '1_958' -> '1_958_Post-exposure_prophylaxis.html'
    },
    
    // --- INITIALIZATION ---
    init() {
        // This function runs on every page load
        
        // 1. Initialize modal (only if it exists on the page)
        const modalEl = document.getElementById('textbookModal');
        if (modalEl) {
            this.textbookModal = new bootstrap.Modal(modalEl);
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
            // Question Batch selection
            const batchLink = e.target.closest('.batch-link');
            if (batchLink) {
                e.preventDefault();
                const module = batchLink.dataset.module;
                const batchFile = batchLink.dataset.batchFile;
                this.loadQuestionList(module, batchFile);
                
                const parent = batchLink.closest('.list-group');
                parent.querySelectorAll('.list-group-item').forEach(li => li.classList.remove('active'));
                batchLink.classList.add('active');
            }
            
            // Question selection
            const questionLink = e.target.closest('.question-link');
            if (questionLink) {
                e.preventDefault();
                const module = questionLink.dataset.module;
                const index = parseInt(questionLink.dataset.index, 10);
                this.loadQuestion(module, index);
                
                const parent = questionLink.closest('.list-group');
                parent.querySelectorAll('.list-group-item').forEach(li => li.classList.remove('active'));
                questionLink.classList.add('active');
            }
            
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
            this.loadQuestionBatches('msra');
            this.loadTextbookIndex('msra'); // For the modal
        } else if (pageId === 'page-pd-questions') {
            this.loadQuestionBatches('pd');
            this.loadTextbookIndex('pd'); // For the modal
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

    // --- QUESTION LOGIC ---
    loadQuestionBatches(module) {
        const config = this[module];
        const listEl = document.getElementById(`${module}-batch-list`);
        if (!listEl) return;
        
        listEl.innerHTML = ''; // Clear list
        let batchCount = Math.ceil(config.totalQuestions / config.batchSize);
        
        for (let i = 0; i < batchCount; i++) {
            const start = i * config.batchSize;
            const end = Math.min(start + config.batchSize - 1, config.totalQuestions - 1);
            const batchFile = `questions_${start}_to_${end}.json`;
            
            const el = document.createElement('a');
            el.href = '#';
            el.className = 'list-group-item list-group-item-action batch-link';
            el.dataset.module = module;
            el.dataset.batchFile = batchFile;
            el.textContent = `Questions ${start + 1} - ${end + 1}`;
            listEl.appendChild(el);
        }
    },
    
    async loadQuestionList(module, batchFile) {
        const config = this[module];
        const listEl = document.getElementById(`${module}-question-list`);
        const areaEl = document.getElementById(`${module}-question-area`);
        listEl.innerHTML = '<p class="text-secondary p-3">Loading questions...</p>';
        areaEl.innerHTML = '<h2 class="text-secondary">Select a question to begin.</h2>';

        try {
            const path = `${config.questionsPath}${batchFile}`;
            const response = await fetch(path);
            if (!response.ok) throw new Error(`File not found: ${path}. Make sure it's in the right folder.`);
            
            const data = await response.json();
            config.currentBatchData = data;
            
            listEl.innerHTML = '';
            data.forEach((q, index) => {
                const el = document.createElement('a');
                el.href = '#';
                el.className = 'list-group-item list-group-item-action question-link';
                el.dataset.module = module;
                el.dataset.index = index;
                el.innerHTML = `
                    <div class="d-flex justify-content-between align-items-center">
                        <span class="fw-bold">Q ${index + 1}</span>
                        <small class="text-secondary">${q.question_id}</small>
                    </div>
                `;
                listEl.appendChild(el);
            });
            
        } catch (err) {
            console.error('Error loading question batch:', err);
            listEl.innerHTML = `<p class="text-danger p-3"><b>Error:</b> ${err.message}</p>`;
        }
    },
    
    loadQuestion(module, index) {
        const q = this[module].currentBatchData[index];
        this.renderQuestion(q, module);
    },
    
    renderQuestion(q, module) {
        const areaEl = document.getElementById(`${module}-question-area`);
        const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        let optionsHtml = '';

        // Sanitize question text
        const questionText = q.question.replace(/<br \/>/g, '<br>').replace(/<q>/g, '<blockquote class="border-start border-4 border-secondary ps-3 my-3 text-secondary">').replace(/<\/q>/g, '</blockquote>');

        switch(String(q.question_type)) {
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

        areaEl.innerHTML = `
            <div data-module="${module}" data-q-type="${q.question_type}">
                <h4 class="text-light mb-4">${questionText}</h4>
                <div class="options-container mb-4">${optionsHtml}</div>
                <button class="btn btn-primary btn-lg submit-answer-btn" data-module="${module}">Submit Answer</button>
                <div class="explanation-container mt-4"></div>
            </div>
        `;
    },
    
    checkAnswer(module) {
        const qContainer = document.getElementById(`${module}-question-area`).firstElementChild;
        if (!qContainer) return;
        
        const qType = qContainer.dataset.qType;
        const config = this[module];
        const qIndex = document.querySelector(`#${module}-question-list .list-group-item.active`).dataset.index;
        const q = config.currentBatchData[qIndex];
        
        let isCorrect = false;
        
        if (qType === '0') { // SBA
            const selected = qContainer.querySelector('.question-option.selected');
            const answerIndex = selected ? selected.dataset.index : null;
            isCorrect = (answerIndex == q.correct_answer);
            
            qContainer.querySelectorAll('.question-option').forEach(opt => {
                opt.setAttribute('data-disabled', 'true');
                if (opt.dataset.index == q.correct_answer) {
                    opt.classList.add('correct');
                } else if (opt.classList.contains('selected')) {
                    opt.classList.add('incorrect');
                }
            });
            
        } else if (qType === '2') { // Ranking
            const inputs = qContainer.querySelectorAll('.rank-input');
            let answerString = "";
            inputs.forEach(input => { answerString += input.value.trim().toUpperCase(); });
            isCorrect = (answerString === q.correct_answer);

            inputs.forEach(input => {
                input.disabled = true;
                const correctRank = q.correct_answer.indexOf(input.dataset.letter) + 1;
                if (input.value == correctRank) {
                    input.classList.add('is-valid');
                } else {
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
                if (correctLetters.includes(opt.dataset.letter)) {
                    opt.classList.add('correct');
                } else if (opt.classList.contains('selected')) {
                    opt.classList.add('incorrect');
                }
            });
        }
        
        qContainer.querySelector('.submit-answer-btn').style.display = 'none';
        this.showExplanation(q, isCorrect, module);
    },
    
    showExplanation(q, isCorrect, module) {
        const container = document.querySelector(`#${module}-question-area .explanation-container`);
        if (!container) return;
        
        let noteLinkHtml = '';
        if (q.notes_id_link && q.notes_id_link !== "0" && q.notes_id_link !== "1_1827") { // 1_1827 is a placeholder
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

    // --- TEXTBOOK LOGIC ---
    async loadTextbookIndex(module) {
        const config = this[module];
        const navEl = document.getElementById(`${module}-textbook-nav`);
        
        // Use cached index if available
        if (config.textbookIndexContent) {
            navEl.innerHTML = config.textbookIndexContent;
            return;
        }

        try {
            const response = await fetch(config.textbookIndexPath);
            if (!response.ok) throw new Error(`File not found: ${config.textbookIndexPath}`);
            
            const html = await response.text();
            
            // Parse the HTML to fix paths and build the noteIdMap
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const links = doc.querySelectorAll('a');
            
            links.forEach(link => {
                const href = link.getAttribute('href');
                if (!href) return;
                
                // Original path: "scraped_content/1_1890_...html"
                // Or: "/content/drive/MyDrive/scrap_ethics/1_958_...html"
                const filename = href.split('/').pop();
                
                // Extract noteId: "1_1890_...html" -> "1_1890"
                const match = filename.match(/^([0-9]+_[0-9]+)_/);
                if (match) {
                    const noteId = match[1];
                    config.noteIdMap[noteId] = filename;
                    
                    // Re-wire the link for our app
                    const correctPath = `${config.textbookPath}${filename}`;
                    link.setAttribute('href', '#');
                    link.setAttribute('data-path', correctPath);
                    link.removeAttribute('target');
                } else {
                    link.setAttribute('data-path', '');
                }
            });
            
            // Get the modified HTML to inject
            config.textbookIndexContent = doc.body.innerHTML;
            navEl.innerHTML = config.textbookIndexContent;
            
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
            // Handle internal anchor links
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
            // Try to load the index again in case it failed the first time
            this.loadTextbookIndex(module).then(() => {
                const newFilename = config.noteIdMap[noteId];
                if (newFilename) {
                    const newPath = `${config.textbookPath}${newFilename}`;
                    this.fetchAndRenderNote(newPath, '#textbookModalBody', noteId);
                    this.textbookModal.show();
                } else {
                    document.getElementById('textbookModalTitle').textContent = "Error";
                    document.getElementById('textbookModalBody').innerHTML = `<p class="text-danger">Could not find note with ID: ${noteId}. Map re-load failed.</p>`;
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
            
            // The note files are JSON wrapped in `[]`
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
                // Failsafe for the ethics notes which are plain HTML
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
