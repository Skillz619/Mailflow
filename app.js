// ==========================================
// MAILFLOW - AI Email Organizer
// Main Application JavaScript
// ==========================================

// ==========================================
// STATE MANAGEMENT
// ==========================================
let state = {
    emails: [],
    trashEmails: [],
    filteredEmails: [],
    currentFilter: 'inbox',
    currentPage: 1,
    totalPages: 1,
    selectedEmails: new Set(),
    isLoading: false,
    user: null,
    nextPageToken: null,
    allEmailsFetched: false
};

// Google API state
let tokenClient;
let gapiInited = false;
let gisInited = false;

// ==========================================
// DOM ELEMENTS
// ==========================================
const elements = {
    // Pages
    loginPage: document.getElementById('loginPage'),
    dashboard: document.getElementById('dashboard'),
    
    // Auth
    googleSignInBtn: document.getElementById('googleSignInBtn'),
    logoutBtn: document.getElementById('logoutBtn'),
    
    // User info
    userAvatar: document.getElementById('userAvatar'),
    userName: document.getElementById('userName'),
    userEmail: document.getElementById('userEmail'),
    
    // Email list
    emailList: document.getElementById('emailList'),
    loadingState: document.getElementById('loadingState'),
    loadingSubtext: document.getElementById('loadingSubtext'),
    emptyState: document.getElementById('emptyState'),
    
    // Search & AI
    searchInput: document.getElementById('searchInput'),
    aiSearchBtn: document.getElementById('aiSearchBtn'),
    aiResponsePanel: document.getElementById('aiResponsePanel'),
    aiResponseContent: document.getElementById('aiResponseContent'),
    aiResponseClose: document.getElementById('aiResponseClose'),
    
    // Actions
    refreshBtn: document.getElementById('refreshBtn'),
    selectAllBtn: document.getElementById('selectAllBtn'),
    markReadBtn: document.getElementById('markReadBtn'),
    deleteBtn: document.getElementById('deleteBtn'),
    composeBtn: document.getElementById('composeBtn'),
    
    // Navigation
    navItems: document.querySelectorAll('.nav-item'),
    sectionTitle: document.getElementById('sectionTitle'),
    
    // Stats
    statUrgent: document.getElementById('statUrgent'),
    statUnread: document.getElementById('statUnread'),
    statToday: document.getElementById('statToday'),
    statTotal: document.getElementById('statTotal'),
    
    // Pagination
    pagination: document.getElementById('pagination'),
    paginationInfo: document.getElementById('paginationInfo'),
    prevPageBtn: document.getElementById('prevPageBtn'),
    nextPageBtn: document.getElementById('nextPageBtn'),
    
    // Email Detail Modal
    emailModal: document.getElementById('emailModal'),
    modalClose: document.getElementById('modalClose'),
    modalAvatar: document.getElementById('modalAvatar'),
    modalSender: document.getElementById('modalSender'),
    modalEmail: document.getElementById('modalEmail'),
    modalSubject: document.getElementById('modalSubject'),
    modalDate: document.getElementById('modalDate'),
    modalTags: document.getElementById('modalTags'),
    modalBody: document.getElementById('modalBody'),
    modalReply: document.getElementById('modalReply'),
    modalForward: document.getElementById('modalForward'),
    modalArchive: document.getElementById('modalArchive'),
    modalDelete: document.getElementById('modalDelete'),
    
    // Compose Modal
    composeModal: document.getElementById('composeModal'),
    composeClose: document.getElementById('composeClose'),
    composeMinimize: document.getElementById('composeMinimize'),
    composeTo: document.getElementById('composeTo'),
    composeCc: document.getElementById('composeCc'),
    composeSubject: document.getElementById('composeSubject'),
    composeBody: document.getElementById('composeBody'),
    sendEmail: document.getElementById('sendEmail'),
    discardDraft: document.getElementById('discardDraft'),
    aiPromptInput: document.getElementById('aiPromptInput'),
    aiGenerateBtn: document.getElementById('aiGenerateBtn'),
    
    // Confirmation Dialog
    confirmDialog: document.getElementById('confirmDialog'),
    confirmTitle: document.getElementById('confirmTitle'),
    confirmMessage: document.getElementById('confirmMessage'),
    confirmIcon: document.getElementById('confirmIcon'),
    confirmOk: document.getElementById('confirmOk'),
    confirmCancel: document.getElementById('confirmCancel'),
    
    // Toast
    toastContainer: document.getElementById('toastContainer')
};

// ==========================================
// GOOGLE API INITIALIZATION
// ==========================================
function gapiLoaded() {
    gapi.load('client', initializeGapiClient);
}

async function initializeGapiClient() {
    try {
        await gapi.client.init({
            discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest'],
        });
        gapiInited = true;
        maybeEnableButton();
    } catch (error) {
        console.error('Error initializing GAPI client:', error);
    }
}

function gisLoaded() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.GOOGLE_CLIENT_ID,
        scope: CONFIG.SCOPES,
        callback: '', // Will be set later
    });
    gisInited = true;
    maybeEnableButton();
}

function maybeEnableButton() {
    if (gapiInited && gisInited) {
        elements.googleSignInBtn.disabled = false;
    }
}

// ==========================================
// AUTHENTICATION
// ==========================================
function handleAuthClick() {
    tokenClient.callback = async (response) => {
        if (response.error !== undefined) {
            showToast('Authentication failed. Please try again.', 'error');
            return;
        }
        
        try {
            // Get user info
            const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: {
                    'Authorization': `Bearer ${gapi.client.getToken().access_token}`
                }
            });
            const userInfo = await userInfoResponse.json();
            
            state.user = userInfo;
            
            // Update UI
            elements.userName.textContent = userInfo.name || 'User';
            elements.userEmail.textContent = userInfo.email || '';
            elements.userAvatar.src = userInfo.picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(userInfo.name)}&background=6366f1&color=fff`;
            
            // Show dashboard
            elements.loginPage.style.display = 'none';
            elements.dashboard.classList.add('active');
            
            showToast('Welcome back, ' + userInfo.name + '!', 'success');
            
            // Fetch emails
            await fetchAllEmails();
            
        } catch (error) {
            console.error('Error during authentication:', error);
            showToast('Error during sign in. Please try again.', 'error');
        }
    };

    if (gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
        tokenClient.requestAccessToken({ prompt: '' });
    }
}

function handleSignOut() {
    const token = gapi.client.getToken();
    if (token !== null) {
        google.accounts.oauth2.revoke(token.access_token);
        gapi.client.setToken('');
    }
    
    // Reset state
    state = {
        emails: [],
        filteredEmails: [],
        currentFilter: 'inbox',
        currentPage: 1,
        totalPages: 1,
        selectedEmails: new Set(),
        isLoading: false,
        user: null,
        nextPageToken: null,
        allEmailsFetched: false
    };
    
    // Reset UI
    elements.dashboard.classList.remove('active');
    elements.loginPage.style.display = 'flex';
    elements.emailList.innerHTML = '';
    
    showToast('Signed out successfully', 'info');
}

// ==========================================
// EMAIL FETCHING WITH PAGINATION
// ==========================================
async function fetchAllEmails() {
    showLoading(true, 'Connecting to Gmail...');
    state.emails = [];
    state.nextPageToken = null;
    state.allEmailsFetched = false;
    
    try {
        let totalFetched = 0;
        let pageToken = null;
        
        // Fetch emails in batches
        while (totalFetched < CONFIG.MAX_EMAILS_TO_FETCH) {
            showLoading(true, `Fetching emails... (${totalFetched} loaded)`);
            
            const response = await gapi.client.gmail.users.messages.list({
                'userId': 'me',
                'maxResults': 100,
                'pageToken': pageToken,
                'labelIds': ['INBOX']
            });
            
            const messages = response.result.messages || [];
            
            if (messages.length === 0) {
                break;
            }
            
            // Fetch details for each message in parallel batches
            const batchSize = 20;
            for (let i = 0; i < messages.length; i += batchSize) {
                const batch = messages.slice(i, i + batchSize);
                const emailDetails = await Promise.all(
                    batch.map(msg => fetchEmailDetails(msg.id))
                );
                
                state.emails.push(...emailDetails.filter(e => e !== null));
                totalFetched += batch.length;
                
                showLoading(true, `Processing emails... (${state.emails.length} ready)`);
            }
            
            pageToken = response.result.nextPageToken;
            if (!pageToken) {
                state.allEmailsFetched = true;
                break;
            }
        }
        
        // Categorize all emails with AI
        showLoading(true, 'AI is categorizing your emails...');
        await categorizeEmails();
        
        // Update UI
        updateStats();
        updateCategoryCounts();
        applyFilter();
        showLoading(false);
        
        showToast(`Loaded ${state.emails.length} emails`, 'success');
        
    } catch (error) {
        console.error('Error fetching emails:', error);
        showToast('Error fetching emails. Please try again.', 'error');
        showLoading(false);
        showEmpty(true);
    }
}

async function fetchEmailDetails(messageId) {
    try {
        const response = await gapi.client.gmail.users.messages.get({
            'userId': 'me',
            'id': messageId,
            'format': 'full'
        });
        
        const msg = response.result;
        const headers = msg.payload.headers;
        
        const getHeader = (name) => {
            const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
            return header ? header.value : '';
        };
        
        const fromHeader = getHeader('From');
        const fromMatch = fromHeader.match(/^(.+?)\s*<(.+?)>$/) || [null, fromHeader, fromHeader];
        
        // Get email body
        let body = '';
        if (msg.payload.body && msg.payload.body.data) {
            body = decodeBase64(msg.payload.body.data);
        } else if (msg.payload.parts) {
            body = getEmailBody(msg.payload.parts);
        }
        
        return {
            id: msg.id,
            threadId: msg.threadId,
            from: fromMatch[1].replace(/"/g, '').trim(),
            email: fromMatch[2] || fromHeader,
            subject: getHeader('Subject') || '(No Subject)',
            snippet: msg.snippet,
            body: body,
            date: new Date(parseInt(msg.internalDate)),
            unread: msg.labelIds?.includes('UNREAD') || false,
            starred: msg.labelIds?.includes('STARRED') || false,
            labels: msg.labelIds || [],
            categories: [] // Will be filled by AI
        };
        
    } catch (error) {
        console.error('Error fetching email details:', error);
        return null;
    }
}

function getEmailBody(parts) {
    let body = '';
    for (const part of parts) {
        if (part.mimeType === 'text/plain' && part.body && part.body.data) {
            body = decodeBase64(part.body.data);
            break;
        } else if (part.mimeType === 'text/html' && part.body && part.body.data) {
            body = decodeBase64(part.body.data);
        } else if (part.parts) {
            body = getEmailBody(part.parts);
            if (body) break;
        }
    }
    return body;
}

function decodeBase64(data) {
    try {
        return decodeURIComponent(escape(atob(data.replace(/-/g, '+').replace(/_/g, '/'))));
    } catch (e) {
        return atob(data.replace(/-/g, '+').replace(/_/g, '/'));
    }
}

// ==========================================
// AI CATEGORIZATION
// ==========================================
async function categorizeEmails() {
    // First, do keyword-based categorization
    state.emails.forEach(email => {
        email.categories = categorizeByKeywords(email);
    });
    
    // Then, use AI for better categorization if API key is available
    if (CONFIG.AI_PROVIDER && CONFIG[`${CONFIG.AI_PROVIDER.toUpperCase()}_API_KEY`] !== `YOUR_${CONFIG.AI_PROVIDER.toUpperCase()}_API_KEY`) {
        try {
            await categorizeWithAI();
        } catch (error) {
            console.log('AI categorization failed, using keyword-based:', error);
        }
    }
}

function categorizeByKeywords(email) {
    const text = `${email.subject} ${email.snippet} ${email.from}`.toLowerCase();
    const categories = [];
    
    for (const [category, keywords] of Object.entries(CONFIG.CATEGORIES)) {
        if (keywords.some(keyword => text.includes(keyword.toLowerCase()))) {
            categories.push(category);
        }
    }
    
    // Default category if none found
    if (categories.length === 0) {
        categories.push('updates');
    }
    
    return categories;
}

async function categorizeWithAI() {
    const provider = CONFIG.AI_PROVIDER;
    const apiKey = CONFIG[`${provider.toUpperCase()}_API_KEY`];
    
    if (!apiKey || apiKey.startsWith('YOUR_')) {
        return;
    }
    
    // Batch emails for AI processing
    const batchSize = 10;
    for (let i = 0; i < state.emails.length; i += batchSize) {
        const batch = state.emails.slice(i, i + batchSize);
        const emailSummaries = batch.map(e => ({
            id: e.id,
            from: e.from,
            subject: e.subject,
            snippet: e.snippet.substring(0, 200)
        }));
        
        try {
            const categories = await callAIForCategorization(emailSummaries, provider, apiKey);
            
            // Apply AI categories
            categories.forEach((cats, index) => {
                if (batch[index]) {
                    batch[index].categories = cats;
                }
            });
        } catch (error) {
            console.error('AI batch categorization error:', error);
        }
    }
}

async function callAIForCategorization(emails, provider, apiKey) {
    const prompt = `Categorize these emails into one or more categories: urgent, important, work, personal, promotions, social, updates, finance, newsletters, spam.
    
Return a JSON array with categories for each email in order.

Emails:
${emails.map((e, i) => `${i + 1}. From: ${e.from}, Subject: ${e.subject}, Preview: ${e.snippet}`).join('\n')}

Response format: [["category1", "category2"], ["category1"], ...]`;

    let response;
    
    if (provider === 'openai') {
        response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.3
            })
        });
        const data = await response.json();
        return JSON.parse(data.choices[0].message.content);
        
    } else if (provider === 'gemini') {
        response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });
        const data = await response.json();
        const text = data.candidates[0].content.parts[0].text;
        // Extract JSON from response
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        return jsonMatch ? JSON.parse(jsonMatch[0]) : emails.map(() => ['updates']);
        
    } else if (provider === 'claude') {
        response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-3-haiku-20240307',
                max_tokens: 1024,
                messages: [{ role: 'user', content: prompt }]
            })
        });
        const data = await response.json();
        const text = data.content[0].text;
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        return jsonMatch ? JSON.parse(jsonMatch[0]) : emails.map(() => ['updates']);
    }
    
    return emails.map(() => ['updates']);
}

// ==========================================
// AI ASSISTANT (Search & Questions)
// ==========================================
async function handleAIQuery(query) {
    const provider = CONFIG.AI_PROVIDER;
    const apiKey = CONFIG[`${provider.toUpperCase()}_API_KEY`];
    
    const q = query.toLowerCase();
    
    // First, always filter and display relevant emails in the list
    const relevantEmails = filterEmailsByQuery(query);
    
    // Update the email list to show relevant emails
    if (relevantEmails.length > 0) {
        state.filteredEmails = relevantEmails;
        state.totalPages = Math.ceil(relevantEmails.length / CONFIG.EMAILS_PER_PAGE) || 1;
        state.currentPage = 1;
        elements.sectionTitle.textContent = `Search Results (${relevantEmails.length})`;
        renderEmails();
        updatePagination();
    }
    
    // If no API key, use local processing for AI response
    if (!apiKey || apiKey.startsWith('YOUR_')) {
        return handleLocalQuery(query);
    }
    
    showAIResponse('<div class="ai-typing-indicator"><span></span><span></span><span></span></div> Thinking...');
    
    try {
        // Prepare email context for AI
        const emailContext = relevantEmails.slice(0, 30).map(e => ({
            from: e.from,
            subject: e.subject,
            snippet: e.snippet.substring(0, 150),
            date: e.date.toLocaleDateString(),
            categories: e.categories,
            unread: e.unread
        }));
        
        const prompt = `You are an AI email assistant. Answer the user's question based on their emails.

Found ${relevantEmails.length} relevant emails:
${JSON.stringify(emailContext, null, 2)}

User's question: ${query}

Instructions:
- Be concise and direct
- If asking for a summary, list the key emails with sender and subject
- If asking about counts, provide the exact number
- Format using HTML: <strong> for emphasis, <ul><li> for lists
- Start with a count like "Found X emails from [sender/category]"
- If no relevant emails found, say so clearly`;

        let responseText = '';
        
        if (provider === 'openai') {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-3.5-turbo',
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.7
                })
            });
            const data = await response.json();
            responseText = data.choices[0].message.content;
            
        } else if (provider === 'gemini') {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: 1024
                    }
                })
            });
            const data = await response.json();
            console.log('Gemini search response:', data);
            if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
                responseText = data.candidates[0].content.parts[0].text;
            } else if (data.error) {
                throw new Error(data.error.message);
            } else {
                throw new Error('No response from Gemini');
            }
            
        } else if (provider === 'claude') {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model: 'claude-3-haiku-20240307',
                    max_tokens: 1024,
                    messages: [{ role: 'user', content: prompt }]
                })
            });
            const data = await response.json();
            responseText = data.content[0].text;
        }
        
        showAIResponse(responseText);
        
    } catch (error) {
        console.error('AI query error:', error);
        return handleLocalQuery(query);
    }
}

// Filter emails based on query - used by both AI and local processing
function filterEmailsByQuery(query) {
    const q = query.toLowerCase();
    
    // All available categories
    const allCategories = ['urgent', 'important', 'work', 'personal', 'promotions', 'social', 'updates', 'finance', 'newsletters', 'spam'];
    const mentionedCategory = allCategories.find(cat => q.includes(cat));
    
    // Extract search keywords - remove common words
    const stopWords = ['can', 'you', 'search', 'find', 'where', 'is', 'my', 'the', 'a', 'an', 'for', 'from', 'me', 'email', 'emails', 'mail', 'mails', 'show', 'get', 'exactly', 'are', 'there', 'any', 'all', 'give', 'list', 'summarize', 'summary', 'what', 'how', 'many', 'tell', 'about'];
    const searchKeywords = q.split(/\s+/).filter(word => word.length > 1 && !stopWords.includes(word));
    
    let relevantEmails = [];
    
    // Priority 1: Search by keywords (sender name, subject, content)
    if (searchKeywords.length > 0) {
        relevantEmails = state.emails.filter(e => 
            searchKeywords.some(term =>
                e.subject.toLowerCase().includes(term) ||
                e.from.toLowerCase().includes(term) ||
                e.email.toLowerCase().includes(term) ||
                e.snippet.toLowerCase().includes(term)
            )
        );
    }
    
    // Priority 2: Filter by category if mentioned and no keyword results
    if (relevantEmails.length === 0 && mentionedCategory) {
        relevantEmails = state.emails.filter(e => e.categories.includes(mentionedCategory));
    }
    
    // Priority 3: Filter by special filters
    if (relevantEmails.length === 0) {
        if (q.includes('unread')) {
            relevantEmails = state.emails.filter(e => e.unread);
        } else if (q.includes('today')) {
            const today = new Date().toDateString();
            relevantEmails = state.emails.filter(e => e.date.toDateString() === today);
        } else if (q.includes('starred')) {
            relevantEmails = state.emails.filter(e => e.starred);
        }
    }
    
    // If still no results and we have search keywords, try partial matching
    if (relevantEmails.length === 0 && searchKeywords.length > 0) {
        // Try matching any part of the keywords
        relevantEmails = state.emails.filter(e => {
            const emailText = `${e.subject} ${e.from} ${e.email} ${e.snippet}`.toLowerCase();
            return searchKeywords.some(term => {
                // Try partial match (at least 3 chars)
                if (term.length >= 3) {
                    return emailText.includes(term);
                }
                return false;
            });
        });
    }
    
    return relevantEmails;
}

function handleLocalQuery(query) {
    const q = query.toLowerCase();
    
    // Get filtered emails using our smart filter function
    const relevantEmails = filterEmailsByQuery(query);
    
    // Update the email list
    if (relevantEmails.length > 0) {
        state.filteredEmails = relevantEmails;
        state.totalPages = Math.ceil(relevantEmails.length / CONFIG.EMAILS_PER_PAGE) || 1;
        state.currentPage = 1;
        elements.sectionTitle.textContent = `Search Results (${relevantEmails.length})`;
        renderEmails();
        updatePagination();
    }
    
    // All available categories
    const allCategories = ['urgent', 'important', 'work', 'personal', 'promotions', 'social', 'updates', 'finance', 'newsletters', 'spam'];
    const mentionedCategory = allCategories.find(cat => q.includes(cat));
    
    let response = '';
    
    // Generate appropriate AI response based on query type
    if (q.includes('how many') || q.includes('count')) {
        // Count queries
        if (mentionedCategory) {
            const count = state.emails.filter(e => e.categories.includes(mentionedCategory)).length;
            response = `You have <strong>${count}</strong> ${mentionedCategory} emails.`;
        } else if (q.includes('unread')) {
            response = `You have <strong>${state.emails.filter(e => e.unread).length}</strong> unread emails.`;
        } else if (q.includes('today')) {
            const today = new Date().toDateString();
            response = `You received <strong>${state.emails.filter(e => e.date.toDateString() === today).length}</strong> emails today.`;
        } else {
            response = `You have <strong>${state.emails.length}</strong> total emails in your inbox.`;
        }
    } else if (relevantEmails.length > 0) {
        // Show found emails
        response = `<strong>Found ${relevantEmails.length} matching emails:</strong><ul>${relevantEmails.slice(0, 10).map(e => `<li><strong>${e.from}</strong>: ${e.subject}</li>`).join('')}</ul>${relevantEmails.length > 10 ? `<p><em>...and ${relevantEmails.length - 10} more below.</em></p>` : ''}`;
    } else {
        // No results
        response = `<strong>No emails found.</strong><p>Try:</p>
        <ul>
            <li>"Find LinkedIn emails"</li>
            <li>"Show finance emails"</li>
            <li>"Summarize urgent emails"</li>
            <li>"How many unread emails"</li>
        </ul>`;
    }
    
    showAIResponse(response);
}

function showAIResponse(content) {
    elements.aiResponseContent.innerHTML = content;
    elements.aiResponsePanel.classList.add('active');
}

function hideAIResponse() {
    elements.aiResponsePanel.classList.remove('active');
}

// ==========================================
// SEARCH FUNCTION
// ==========================================
function performSearch(query) {
    const searchTerm = query.toLowerCase().trim();
    
    if (!searchTerm) {
        applyFilter();
        return;
    }
    
    // Search ALL emails regardless of current filter
    const searchResults = state.emails.filter(e =>
        e.subject.toLowerCase().includes(searchTerm) ||
        e.from.toLowerCase().includes(searchTerm) ||
        e.email.toLowerCase().includes(searchTerm) ||
        e.snippet.toLowerCase().includes(searchTerm)
    );
    
    // Update section title
    elements.sectionTitle.textContent = `Search Results for "${query}"`;
    
    // Display results
    state.filteredEmails = searchResults;
    state.totalPages = Math.ceil(searchResults.length / CONFIG.EMAILS_PER_PAGE) || 1;
    state.currentPage = 1;
    
    renderEmails();
    updatePagination();
    
    // Also show AI response with summary
    if (searchResults.length > 0) {
        showAIResponse(`<strong>Found ${searchResults.length} emails matching "${query}":</strong><ul>${searchResults.slice(0, 5).map(e => `<li><strong>${e.from}</strong>: ${e.subject}</li>`).join('')}</ul>${searchResults.length > 5 ? `<p>...and ${searchResults.length - 5} more</p>` : ''}`);
    } else {
        showAIResponse(`<strong>No emails found matching "${query}"</strong><p>Try a different search term or ask me a question like "show my finance emails"</p>`);
    }
}

// ==========================================
// FILTERING & RENDERING
// ==========================================
function applyFilter() {
    const filter = state.currentFilter;
    const searchTerm = elements.searchInput.value.toLowerCase();
    
    let filtered;
    
    // Handle trash separately
    if (filter === 'trash') {
        filtered = [...state.trashEmails];
    } else {
        filtered = [...state.emails];
        
        // Apply category/folder filter
        switch (filter) {
            case 'inbox':
                // Show all inbox emails
                break;
            case 'unread':
                filtered = filtered.filter(e => e.unread);
                break;
            case 'starred':
                filtered = filtered.filter(e => e.starred);
                break;
            case 'today':
                const today = new Date().toDateString();
                filtered = filtered.filter(e => e.date.toDateString() === today);
                break;
            case 'sent':
                filtered = []; // Would need separate API calls
                break;
            default:
                // Category filters
                filtered = filtered.filter(e => e.categories.includes(filter));
        }
    }
    
    // Apply search filter
    if (searchTerm && !isAIQuery(searchTerm)) {
        filtered = filtered.filter(e =>
            e.subject.toLowerCase().includes(searchTerm) ||
            e.from.toLowerCase().includes(searchTerm) ||
            e.snippet.toLowerCase().includes(searchTerm)
        );
    }
    
    state.filteredEmails = filtered;
    state.totalPages = Math.ceil(filtered.length / CONFIG.EMAILS_PER_PAGE) || 1;
    state.currentPage = 1;
    
    renderEmails();
    updatePagination();
}

function isAIQuery(query) {
    const q = query.toLowerCase();
    // AI query patterns
    const aiPatterns = [
        'how many', 'summarize', 'summary', 'tell me', 'show me', 
        'find', 'search for', 'where is', 'where are', 'can you',
        'what are', 'what is', 'list', 'get me', 'give me',
        'do i have', 'any emails', 'tasks', 'todo', 'deadline',
        'meeting', 'urgent', 'important'
    ];
    return aiPatterns.some(pattern => q.includes(pattern));
}

function renderEmails() {
    const start = (state.currentPage - 1) * CONFIG.EMAILS_PER_PAGE;
    const end = start + CONFIG.EMAILS_PER_PAGE;
    const emailsToShow = state.filteredEmails.slice(start, end);
    const isTrashView = state.currentFilter === 'trash';
    
    if (emailsToShow.length === 0) {
        showEmpty(true);
        elements.pagination.classList.add('hidden');
        return;
    }
    
    showEmpty(false);
    elements.emailList.classList.remove('hidden');
    elements.pagination.classList.remove('hidden');
    
    elements.emailList.innerHTML = emailsToShow.map((email, index) => `
        <div class="email-item ${email.unread ? 'unread' : ''} ${state.selectedEmails.has(email.id) ? 'selected' : ''} ${isTrashView ? 'trash-item' : ''}" 
             data-id="${email.id}" 
             style="animation-delay: ${index * 0.03}s">
            <div class="email-checkbox ${state.selectedEmails.has(email.id) ? 'checked' : ''}" data-id="${email.id}"></div>
            <div class="email-star ${email.starred ? 'starred' : ''}" data-id="${email.id}">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${email.starred ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                </svg>
            </div>
            <div class="email-avatar" style="background: ${getAvatarColor(email.from)}">
                ${email.from.charAt(0).toUpperCase()}
            </div>
            <div class="email-body">
                <div class="email-header">
                    <span class="email-sender">${escapeHtml(email.from)}</span>
                    <span class="email-time">${formatDate(email.date)}</span>
                </div>
                <div class="email-subject">${escapeHtml(email.subject)}</div>
                <div class="email-preview">${escapeHtml(email.snippet)}</div>
                <div class="email-tags">
                    ${isTrashView ? '<span class="email-tag trash-tag">TRASH</span>' : ''}
                    ${email.categories.map(cat => `<span class="email-tag ${cat}">${cat}</span>`).join('')}
                </div>
            </div>
            ${isTrashView ? `
            <div class="trash-actions">
                <button class="trash-action-btn restore-btn" data-id="${email.id}" title="Restore to Inbox">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="9 14 4 9 9 4"></polyline>
                        <path d="M20 20v-7a4 4 0 0 0-4-4H4"></path>
                    </svg>
                </button>
                <button class="trash-action-btn delete-permanent-btn" data-id="${email.id}" title="Delete Permanently">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        <line x1="10" y1="11" x2="10" y2="17"></line>
                        <line x1="14" y1="11" x2="14" y2="17"></line>
                    </svg>
                </button>
            </div>
            ` : ''}
        </div>
    `).join('');
    
    // Add event listeners
    attachEmailEventListeners();
}

function attachEmailEventListeners() {
    // Checkbox clicks
    document.querySelectorAll('.email-checkbox').forEach(checkbox => {
        checkbox.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = checkbox.dataset.id;
            toggleEmailSelection(id);
        });
    });
    
    // Star clicks
    document.querySelectorAll('.email-star').forEach(star => {
        star.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = star.dataset.id;
            toggleStar(id);
        });
    });
    
    // Email item clicks (open modal)
    document.querySelectorAll('.email-item').forEach(item => {
        item.addEventListener('click', (e) => {
            // Don't open modal if clicking on trash action buttons
            if (e.target.closest('.trash-actions')) return;
            const id = item.dataset.id;
            openEmailModal(id);
        });
    });
    
    // Trash restore buttons
    document.querySelectorAll('.restore-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            restoreFromTrash(id);
        });
    });
    
    // Trash permanent delete buttons
    document.querySelectorAll('.delete-permanent-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            permanentlyDeleteEmail(id);
        });
    });
}

// ==========================================
// UI HELPER FUNCTIONS
// ==========================================
function updateStats() {
    const today = new Date().toDateString();
    
    elements.statUrgent.textContent = state.emails.filter(e => e.categories.includes('urgent')).length;
    elements.statUnread.textContent = state.emails.filter(e => e.unread).length;
    elements.statToday.textContent = state.emails.filter(e => e.date.toDateString() === today).length;
    elements.statTotal.textContent = state.emails.length;
}

function updateCategoryCounts() {
    const counts = {
        inbox: state.emails.length,
        unread: state.emails.filter(e => e.unread).length,
        starred: state.emails.filter(e => e.starred).length,
        trash: state.trashEmails.length,
        important: state.emails.filter(e => e.categories.includes('important')).length,
        urgent: state.emails.filter(e => e.categories.includes('urgent')).length,
        work: state.emails.filter(e => e.categories.includes('work')).length,
        personal: state.emails.filter(e => e.categories.includes('personal')).length,
        promotions: state.emails.filter(e => e.categories.includes('promotions')).length,
        social: state.emails.filter(e => e.categories.includes('social')).length,
        updates: state.emails.filter(e => e.categories.includes('updates')).length,
        finance: state.emails.filter(e => e.categories.includes('finance')).length,
        newsletters: state.emails.filter(e => e.categories.includes('newsletters')).length,
        spam: state.emails.filter(e => e.categories.includes('spam')).length
    };
    
    for (const [key, count] of Object.entries(counts)) {
        const el = document.getElementById(`${key}Count`);
        if (el) el.textContent = count;
    }
}

function updatePagination() {
    elements.paginationInfo.textContent = `Page ${state.currentPage} of ${state.totalPages}`;
    elements.prevPageBtn.disabled = state.currentPage <= 1;
    elements.nextPageBtn.disabled = state.currentPage >= state.totalPages;
}

function showLoading(show, text = 'Loading your emails...') {
    if (show) {
        elements.loadingState.classList.remove('hidden');
        elements.emailList.classList.add('hidden');
        elements.emptyState.classList.add('hidden');
        elements.pagination.classList.add('hidden');
        elements.loadingSubtext.textContent = text;
    } else {
        elements.loadingState.classList.add('hidden');
    }
}

function showEmpty(show) {
    if (show) {
        elements.emptyState.classList.remove('hidden');
        elements.emailList.classList.add('hidden');
    } else {
        elements.emptyState.classList.add('hidden');
        elements.emailList.classList.remove('hidden');
    }
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
        success: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>',
        error: '<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>',
        info: '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>'
    };
    
    toast.innerHTML = `
        <svg class="toast-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            ${icons[type] || icons.info}
        </svg>
        <span class="toast-message">${message}</span>
    `;
    
    elements.toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'toastIn 0.3s ease-out reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ==========================================
// EMAIL ACTIONS
// ==========================================
function toggleEmailSelection(id) {
    if (state.selectedEmails.has(id)) {
        state.selectedEmails.delete(id);
    } else {
        state.selectedEmails.add(id);
    }
    renderEmails();
}

function selectAllEmails() {
    const currentEmails = state.filteredEmails.slice(
        (state.currentPage - 1) * CONFIG.EMAILS_PER_PAGE,
        state.currentPage * CONFIG.EMAILS_PER_PAGE
    );
    
    const allSelected = currentEmails.every(e => state.selectedEmails.has(e.id));
    
    if (allSelected) {
        currentEmails.forEach(e => state.selectedEmails.delete(e.id));
    } else {
        currentEmails.forEach(e => state.selectedEmails.add(e.id));
    }
    
    renderEmails();
}

async function toggleStar(id) {
    const email = state.emails.find(e => e.id === id);
    if (!email) return;
    
    email.starred = !email.starred;
    
    try {
        if (email.starred) {
            await gapi.client.gmail.users.messages.modify({
                userId: 'me',
                id: id,
                resource: { addLabelIds: ['STARRED'] }
            });
        } else {
            await gapi.client.gmail.users.messages.modify({
                userId: 'me',
                id: id,
                resource: { removeLabelIds: ['STARRED'] }
            });
        }
    } catch (error) {
        console.error('Error toggling star:', error);
        email.starred = !email.starred; // Revert
    }
    
    updateCategoryCounts();
    renderEmails();
}

async function markSelectedAsRead() {
    if (state.selectedEmails.size === 0) {
        showToast('No emails selected', 'info');
        return;
    }
    
    try {
        for (const id of state.selectedEmails) {
            await gapi.client.gmail.users.messages.modify({
                userId: 'me',
                id: id,
                resource: { removeLabelIds: ['UNREAD'] }
            });
            
            const email = state.emails.find(e => e.id === id);
            if (email) email.unread = false;
        }
        
        state.selectedEmails.clear();
        updateStats();
        updateCategoryCounts();
        renderEmails();
        showToast('Marked as read', 'success');
        
    } catch (error) {
        console.error('Error marking as read:', error);
        showToast('Error marking emails', 'error');
    }
}

async function deleteSelectedEmails() {
    if (state.selectedEmails.size === 0) {
        showToast('No emails selected', 'info');
        return;
    }
    
    const isTrashView = state.currentFilter === 'trash';
    const confirmMsg = isTrashView 
        ? `Permanently delete ${state.selectedEmails.size} emails? This cannot be undone.`
        : `Move ${state.selectedEmails.size} emails to trash?`;
    
    showConfirmDialog(
        isTrashView ? 'Permanently Delete?' : 'Move to Trash?',
        confirmMsg,
        async () => {
            try {
                for (const id of state.selectedEmails) {
                    if (isTrashView) {
                        // Permanently delete from trash
                        await gapi.client.gmail.users.messages.delete({
                            userId: 'me',
                            id: id
                        });
                        state.trashEmails = state.trashEmails.filter(e => e.id !== id);
                    } else {
                        // Move to trash
                        await gapi.client.gmail.users.messages.trash({
                            userId: 'me',
                            id: id
                        });
                        
                        // Move email from inbox to trash
                        const email = state.emails.find(e => e.id === id);
                        if (email) {
                            state.trashEmails.push(email);
                            state.emails = state.emails.filter(e => e.id !== id);
                        }
                    }
                }
                
                state.selectedEmails.clear();
                updateStats();
                updateCategoryCounts();
                applyFilter();
                showToast(isTrashView ? 'Emails permanently deleted' : 'Emails moved to trash', 'success');
                
            } catch (error) {
                console.error('Error deleting emails:', error);
                showToast('Error deleting emails', 'error');
            }
        }
    );
}

// ==========================================
// EMAIL MODAL
// ==========================================
function openEmailModal(id) {
    // Find email in inbox or trash
    let email = state.emails.find(e => e.id === id);
    const isTrash = !email;
    if (!email) {
        email = state.trashEmails.find(e => e.id === id);
    }
    if (!email) return;
    
    // Track current email for reply/forward/delete actions
    currentOpenEmailId = id;
    
    elements.modalAvatar.textContent = email.from.charAt(0).toUpperCase();
    elements.modalAvatar.style.background = getAvatarColor(email.from);
    elements.modalSender.textContent = email.from;
    elements.modalEmail.textContent = email.email;
    elements.modalSubject.textContent = email.subject;
    elements.modalDate.textContent = formatDateFull(email.date);
    
    // Show trash tag if in trash
    const trashTag = isTrash ? '<span class="email-tag trash-tag">TRASH</span> ' : '';
    elements.modalTags.innerHTML = trashTag + email.categories.map(cat => `<span class="email-tag ${cat}">${cat}</span>`).join(' ');
    elements.modalBody.innerHTML = email.body || email.snippet;
    
    // Update modal buttons based on whether email is in trash
    if (isTrash) {
        elements.modalReply.style.display = 'none';
        elements.modalForward.style.display = 'none';
        elements.modalArchive.style.display = 'none';
        elements.modalDelete.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
            Delete Forever
        `;
    } else {
        elements.modalReply.style.display = 'flex';
        elements.modalForward.style.display = 'flex';
        elements.modalArchive.style.display = 'flex';
        elements.modalDelete.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            Delete
        `;
    }
    
    elements.emailModal.classList.add('active');
    
    // Mark as read (only for inbox emails)
    if (!isTrash && email.unread) {
        markAsRead(id);
    }
}

async function markAsRead(id) {
    const email = state.emails.find(e => e.id === id);
    if (!email || !email.unread) return;
    
    try {
        await gapi.client.gmail.users.messages.modify({
            userId: 'me',
            id: id,
            resource: { removeLabelIds: ['UNREAD'] }
        });
        
        email.unread = false;
        updateStats();
        updateCategoryCounts();
        renderEmails();
        
    } catch (error) {
        console.error('Error marking as read:', error);
    }
}

function closeEmailModal() {
    elements.emailModal.classList.remove('active');
    currentOpenEmailId = null;
}

// ==========================================
// COMPOSE EMAIL FUNCTIONS
// ==========================================
let currentReplyTo = null;

function openComposeModal(replyTo = null, forwardEmail = null) {
    currentReplyTo = replyTo;
    
    // Clear previous content
    elements.composeTo.value = '';
    elements.composeCc.value = '';
    elements.composeSubject.value = '';
    elements.composeBody.value = '';
    elements.aiPromptInput.value = '';
    
    // If replying to an email
    if (replyTo) {
        elements.composeTo.value = replyTo.email;
        elements.composeSubject.value = replyTo.subject.startsWith('Re:') ? replyTo.subject : `Re: ${replyTo.subject}`;
        elements.composeBody.value = `\n\n---\nOn ${formatDateFull(replyTo.date)}, ${replyTo.from} wrote:\n${replyTo.snippet}`;
    }
    
    // If forwarding an email
    if (forwardEmail) {
        elements.composeSubject.value = forwardEmail.subject.startsWith('Fwd:') ? forwardEmail.subject : `Fwd: ${forwardEmail.subject}`;
        elements.composeBody.value = `\n\n---\nForwarded message:\nFrom: ${forwardEmail.from}\nDate: ${formatDateFull(forwardEmail.date)}\nSubject: ${forwardEmail.subject}\n\n${forwardEmail.snippet}`;
    }
    
    elements.composeModal.classList.add('active');
    elements.composeTo.focus();
}

function closeComposeModal() {
    const hasContent = elements.composeTo.value || elements.composeSubject.value || elements.composeBody.value;
    
    if (hasContent) {
        showConfirmDialog(
            'Discard draft?',
            'Your message will be discarded.',
            () => {
                elements.composeModal.classList.remove('active');
                currentReplyTo = null;
            }
        );
    } else {
        elements.composeModal.classList.remove('active');
        currentReplyTo = null;
    }
}

async function sendEmailMessage() {
    const to = elements.composeTo.value.trim();
    const cc = elements.composeCc.value.trim();
    const subject = elements.composeSubject.value.trim();
    const body = elements.composeBody.value.trim();
    
    // Validation
    if (!to) {
        showToast('Please enter a recipient email', 'error');
        elements.composeTo.focus();
        return;
    }
    
    if (!isValidEmail(to)) {
        showToast('Please enter a valid email address', 'error');
        elements.composeTo.focus();
        return;
    }
    
    if (!subject) {
        showToast('Please enter a subject', 'error');
        elements.composeSubject.focus();
        return;
    }
    
    if (!body) {
        showToast('Please enter a message body', 'error');
        elements.composeBody.focus();
        return;
    }
    
    // Show loading state
    elements.sendEmail.disabled = true;
    elements.sendEmail.classList.add('loading');
    elements.sendEmail.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
        </svg>
        Sending...
    `;
    
    try {
        // Create email message
        let email = [
            `To: ${to}`,
            `From: ${state.user.email}`,
            `Subject: ${subject}`,
            'Content-Type: text/plain; charset=utf-8',
            '',
            body
        ];
        
        if (cc) {
            email.splice(2, 0, `Cc: ${cc}`);
        }
        
        const rawMessage = btoa(unescape(encodeURIComponent(email.join('\r\n'))))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
        
        // Send via Gmail API
        await gapi.client.gmail.users.messages.send({
            userId: 'me',
            resource: {
                raw: rawMessage
            }
        });
        
        showToast('Email sent successfully!', 'success');
        elements.composeModal.classList.remove('active');
        currentReplyTo = null;
        
    } catch (error) {
        console.error('Error sending email:', error);
        showToast('Failed to send email. Please try again.', 'error');
    } finally {
        // Reset button
        elements.sendEmail.disabled = false;
        elements.sendEmail.classList.remove('loading');
        elements.sendEmail.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
            Send
        `;
    }
}

function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

// ==========================================
// AI EMAIL GENERATION
// ==========================================
async function generateEmailWithAI() {
    const prompt = elements.aiPromptInput.value.trim();
    
    if (!prompt) {
        showToast('Please describe what you want to write', 'info');
        elements.aiPromptInput.focus();
        return;
    }
    
    const provider = CONFIG.AI_PROVIDER;
    const apiKey = CONFIG[`${provider.toUpperCase()}_API_KEY`];
    
    if (!apiKey || apiKey.startsWith('YOUR_')) {
        showToast('AI API key not configured', 'error');
        return;
    }
    
    // Show loading state
    elements.aiGenerateBtn.disabled = true;
    elements.aiGenerateBtn.classList.add('loading');
    const originalBtnText = elements.aiGenerateBtn.innerHTML;
    elements.aiGenerateBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
        </svg>
        Generating...
    `;
    
    try {
        const aiPrompt = `You are an email writing assistant. Write a professional email based on this request:

"${prompt}"

Requirements:
- Write only the email body (no subject line)
- Be professional but friendly
- Be concise and clear
- Do not include any greetings like "Subject:" or "To:"
- Start directly with a greeting like "Dear..." or "Hi..." 
- End with an appropriate closing and signature placeholder like "[Your Name]"

Write the email:`;

        let generatedText = '';
        
        if (provider === 'gemini') {
            // Use current Gemini models - try multiple in order
            const models = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
            let success = false;
            let lastError = null;
            
            for (const model of models) {
                try {
                    console.log(`Trying model: ${model}`);
                    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{ 
                                parts: [{ text: aiPrompt }] 
                            }],
                            generationConfig: {
                                temperature: 0.7,
                                maxOutputTokens: 1024
                            }
                        })
                    });
                    
                    const data = await response.json();
                    console.log(`Response from ${model}:`, data);
                    
                    if (data.error) {
                        console.log(`Model ${model} error:`, data.error.message);
                        lastError = data.error.message;
                        continue;
                    }
                    
                    if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
                        generatedText = data.candidates[0].content.parts[0].text;
                        success = true;
                        console.log('Generated text:', generatedText);
                        break;
                    }
                } catch (e) {
                    console.log(`Model ${model} failed:`, e);
                    lastError = e.message;
                    continue;
                }
            }
            
            if (!success) {
                throw new Error(lastError || 'All Gemini models failed');
            }
            
        } else if (provider === 'openai') {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-3.5-turbo',
                    messages: [{ role: 'user', content: aiPrompt }],
                    temperature: 0.7
                })
            });
            const data = await response.json();
            generatedText = data.choices[0].message.content;
            
        } else if (provider === 'claude') {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model: 'claude-3-haiku-20240307',
                    max_tokens: 1024,
                    messages: [{ role: 'user', content: aiPrompt }]
                })
            });
            const data = await response.json();
            generatedText = data.content[0].text;
        }
        
        if (!generatedText) {
            throw new Error('No text generated');
        }
        
        // Set the generated text in the compose body
        elements.composeBody.value = generatedText;
        
        // Also try to generate a subject if empty
        if (!elements.composeSubject.value) {
            await generateSubjectWithAI(prompt);
        }
        
        showToast('Email generated! Review and edit as needed.', 'success');
        
    } catch (error) {
        console.error('Error generating email:', error);
        showToast('Failed to generate email: ' + error.message, 'error');
    } finally {
        elements.aiGenerateBtn.disabled = false;
        elements.aiGenerateBtn.classList.remove('loading');
        elements.aiGenerateBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
            </svg>
            Generate
        `;
    }
}

async function generateSubjectWithAI(prompt) {
    const provider = CONFIG.AI_PROVIDER;
    const apiKey = CONFIG[`${provider.toUpperCase()}_API_KEY`];
    
    try {
        const subjectPrompt = `Based on this email request: "${prompt}"
        
Generate a short, professional email subject line (max 10 words). Only output the subject, nothing else.`;

        let subject = '';
        
        if (provider === 'gemini') {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: subjectPrompt }] }],
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: 50
                    }
                })
            });
            const data = await response.json();
            if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
                subject = data.candidates[0].content.parts[0].text.trim();
            }
        } else if (provider === 'openai') {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-3.5-turbo',
                    messages: [{ role: 'user', content: subjectPrompt }],
                    temperature: 0.7,
                    max_tokens: 50
                })
            });
            const data = await response.json();
            subject = data.choices[0].message.content.trim();
        }
        
        if (subject) {
            elements.composeSubject.value = subject.replace(/^["']|["']$/g, '');
        }
        
    } catch (error) {
        console.log('Could not generate subject:', error);
    }
}

// ==========================================
// CONFIRMATION DIALOG
// ==========================================
let confirmCallback = null;

function showConfirmDialog(title, message, onConfirm, isDanger = true) {
    elements.confirmTitle.textContent = title;
    elements.confirmMessage.textContent = message;
    confirmCallback = onConfirm;
    
    if (isDanger) {
        elements.confirmIcon.className = 'confirm-icon';
        elements.confirmOk.className = 'confirm-ok';
    } else {
        elements.confirmIcon.className = 'confirm-icon success';
        elements.confirmOk.className = 'confirm-ok primary';
    }
    
    elements.confirmDialog.classList.add('active');
}

function closeConfirmDialog() {
    elements.confirmDialog.classList.remove('active');
    confirmCallback = null;
}

function executeConfirm() {
    if (confirmCallback) {
        confirmCallback();
    }
    closeConfirmDialog();
}

// ==========================================
// MARK AS UNREAD
// ==========================================
async function markSelectedAsUnread() {
    if (state.selectedEmails.size === 0) {
        showToast('No emails selected', 'info');
        return;
    }
    
    try {
        for (const id of state.selectedEmails) {
            await gapi.client.gmail.users.messages.modify({
                userId: 'me',
                id: id,
                resource: { addLabelIds: ['UNREAD'] }
            });
            
            const email = state.emails.find(e => e.id === id);
            if (email) email.unread = true;
        }
        
        state.selectedEmails.clear();
        updateStats();
        updateCategoryCounts();
        renderEmails();
        showToast('Marked as unread', 'success');
        
    } catch (error) {
        console.error('Error marking as unread:', error);
        showToast('Error marking emails', 'error');
    }
}

// ==========================================
// ARCHIVE EMAILS
// ==========================================
async function archiveEmail(id) {
    try {
        await gapi.client.gmail.users.messages.modify({
            userId: 'me',
            id: id,
            resource: { removeLabelIds: ['INBOX'] }
        });
        
        state.emails = state.emails.filter(e => e.id !== id);
        updateStats();
        updateCategoryCounts();
        applyFilter();
        closeEmailModal();
        showToast('Email archived', 'success');
        
    } catch (error) {
        console.error('Error archiving email:', error);
        showToast('Error archiving email', 'error');
    }
}

// ==========================================
// DELETE SINGLE EMAIL
// ==========================================
async function deleteEmail(id) {
    const isTrashView = state.currentFilter === 'trash';
    
    showConfirmDialog(
        isTrashView ? 'Permanently Delete?' : 'Move to Trash?',
        isTrashView ? 'This email will be permanently deleted. This cannot be undone.' : 'This email will be moved to trash.',
        async () => {
            try {
                if (isTrashView) {
                    // Permanently delete
                    await gapi.client.gmail.users.messages.delete({
                        userId: 'me',
                        id: id
                    });
                    state.trashEmails = state.trashEmails.filter(e => e.id !== id);
                } else {
                    // Move to trash
                    await gapi.client.gmail.users.messages.trash({
                        userId: 'me',
                        id: id
                    });
                    
                    const email = state.emails.find(e => e.id === id);
                    if (email) {
                        state.trashEmails.push(email);
                        state.emails = state.emails.filter(e => e.id !== id);
                    }
                }
                
                updateStats();
                updateCategoryCounts();
                applyFilter();
                closeEmailModal();
                showToast(isTrashView ? 'Email permanently deleted' : 'Email moved to trash', 'success');
                
            } catch (error) {
                console.error('Error deleting email:', error);
                showToast('Error deleting email', 'error');
            }
        }
    );
}

// ==========================================
// RESTORE FROM TRASH
// ==========================================
async function restoreFromTrash(id) {
    try {
        await gapi.client.gmail.users.messages.untrash({
            userId: 'me',
            id: id
        });
        
        // Move email from trash back to inbox
        const email = state.trashEmails.find(e => e.id === id);
        if (email) {
            state.emails.unshift(email); // Add to beginning of inbox
            state.trashEmails = state.trashEmails.filter(e => e.id !== id);
        }
        
        updateStats();
        updateCategoryCounts();
        applyFilter();
        showToast('Email restored to inbox', 'success');
        
    } catch (error) {
        console.error('Error restoring email:', error);
        showToast('Error restoring email', 'error');
    }
}

// ==========================================
// PERMANENTLY DELETE EMAIL
// ==========================================
async function permanentlyDeleteEmail(id) {
    showConfirmDialog(
        'Permanently Delete?',
        'This email will be permanently deleted. This action cannot be undone.',
        async () => {
            try {
                await gapi.client.gmail.users.messages.delete({
                    userId: 'me',
                    id: id
                });
                
                state.trashEmails = state.trashEmails.filter(e => e.id !== id);
                updateCategoryCounts();
                applyFilter();
                showToast('Email permanently deleted', 'success');
                
            } catch (error) {
                console.error('Error permanently deleting email:', error);
                showToast('Error deleting email', 'error');
            }
        }
    );
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================
function formatDate(date) {
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) {
        return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } else if (days === 1) {
        return 'Yesterday';
    } else if (days < 7) {
        return date.toLocaleDateString('en-US', { weekday: 'short' });
    } else {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
}

function formatDateFull(date) {
    return date.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
}

function getAvatarColor(name) {
    const colors = [
        '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
        '#f59e0b', '#22c55e', '#14b8a6', '#3b82f6',
        '#10b981', '#f97316', '#06b6d4', '#84cc16'
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==========================================
// EVENT LISTENERS
// ==========================================
function initializeEventListeners() {
    // Auth
    elements.googleSignInBtn.addEventListener('click', handleAuthClick);
    elements.logoutBtn.addEventListener('click', handleSignOut);
    
    // Search & AI - Always use AI when clicking Ask AI button
    elements.aiSearchBtn.addEventListener('click', () => {
        const query = elements.searchInput.value.trim();
        if (query) {
            // Always use AI when clicking the Ask AI button
            handleAIQuery(query);
        }
    });
    
    elements.searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const query = elements.searchInput.value.trim();
            if (query) {
                // Check if it's an AI query or simple search
                if (isAIQuery(query)) {
                    handleAIQuery(query);
                } else {
                    // Simple search - search ALL emails regardless of current filter
                    performSearch(query);
                }
            }
        }
    });
    
    elements.searchInput.addEventListener('input', () => {
        const query = elements.searchInput.value.trim();
        if (!query) {
            hideAIResponse();
            applyFilter();
        }
    });
    
    elements.aiResponseClose.addEventListener('click', hideAIResponse);
    
    // Refresh
    elements.refreshBtn.addEventListener('click', async () => {
        elements.refreshBtn.classList.add('loading');
        await fetchAllEmails();
        elements.refreshBtn.classList.remove('loading');
    });
    
    // Email actions
    elements.selectAllBtn.addEventListener('click', selectAllEmails);
    elements.markReadBtn.addEventListener('click', markSelectedAsRead);
    elements.deleteBtn.addEventListener('click', deleteSelectedEmails);
    
    // Compose button
    elements.composeBtn.addEventListener('click', () => openComposeModal());
    
    // Compose modal events
    elements.composeClose.addEventListener('click', closeComposeModal);
    elements.composeMinimize.addEventListener('click', () => {
        elements.composeModal.classList.remove('active');
    });
    elements.discardDraft.addEventListener('click', closeComposeModal);
    elements.sendEmail.addEventListener('click', sendEmailMessage);
    
    // AI email generation
    elements.aiGenerateBtn.addEventListener('click', generateEmailWithAI);
    elements.aiPromptInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            generateEmailWithAI();
        }
    });
    
    // AI suggestion buttons
    document.querySelectorAll('.ai-suggestion-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            elements.aiPromptInput.value = btn.dataset.prompt;
            generateEmailWithAI();
        });
    });
    
    // Compose modal click outside to close
    elements.composeModal.addEventListener('click', (e) => {
        if (e.target === elements.composeModal) {
            closeComposeModal();
        }
    });
    
    // Confirmation dialog
    elements.confirmOk.addEventListener('click', executeConfirm);
    elements.confirmCancel.addEventListener('click', closeConfirmDialog);
    elements.confirmDialog.addEventListener('click', (e) => {
        if (e.target === elements.confirmDialog) {
            closeConfirmDialog();
        }
    });
    
    // Email modal action buttons
    elements.modalReply.addEventListener('click', () => {
        const email = state.emails.find(e => e.id === currentOpenEmailId);
        if (email) {
            closeEmailModal();
            openComposeModal(email);
        }
    });
    
    elements.modalForward.addEventListener('click', () => {
        const email = state.emails.find(e => e.id === currentOpenEmailId);
        if (email) {
            closeEmailModal();
            openComposeModal(null, email);
        }
    });
    
    elements.modalArchive.addEventListener('click', () => {
        if (currentOpenEmailId) {
            archiveEmail(currentOpenEmailId);
        }
    });
    
    elements.modalDelete.addEventListener('click', () => {
        if (currentOpenEmailId) {
            deleteEmail(currentOpenEmailId);
        }
    });
    
    // Navigation
    elements.navItems.forEach(item => {
        item.addEventListener('click', () => {
            elements.navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            state.currentFilter = item.dataset.filter;
            elements.sectionTitle.textContent = item.querySelector('.nav-item-text')?.textContent || 'All Mail';
            elements.searchInput.value = ''; // Clear search
            hideAIResponse();
            applyFilter();
        });
    });
    
    // Stats cards (quick filters)
    document.querySelectorAll('.stat-card').forEach(card => {
        card.addEventListener('click', () => {
            const filter = card.dataset.filter;
            if (filter) {
                state.currentFilter = filter;
                elements.navItems.forEach(i => {
                    i.classList.toggle('active', i.dataset.filter === filter);
                });
                applyFilter();
            }
        });
    });
    
    // Pagination
    elements.prevPageBtn.addEventListener('click', () => {
        if (state.currentPage > 1) {
            state.currentPage--;
            renderEmails();
            updatePagination();
        }
    });
    
    elements.nextPageBtn.addEventListener('click', () => {
        if (state.currentPage < state.totalPages) {
            state.currentPage++;
            renderEmails();
            updatePagination();
        }
    });
    
    // Email Detail Modal
    elements.modalClose.addEventListener('click', closeEmailModal);
    elements.emailModal.addEventListener('click', (e) => {
        if (e.target === elements.emailModal) {
            closeEmailModal();
        }
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Escape key
        if (e.key === 'Escape') {
            if (elements.confirmDialog.classList.contains('active')) {
                closeConfirmDialog();
            } else if (elements.composeModal.classList.contains('active')) {
                closeComposeModal();
            } else if (elements.emailModal.classList.contains('active')) {
                closeEmailModal();
            } else {
                hideAIResponse();
            }
        }
        
        // Ctrl/Cmd + Enter to send email
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && elements.composeModal.classList.contains('active')) {
            sendEmailMessage();
        }
        
        // C to compose (when not in input)
        if (e.key === 'c' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
            openComposeModal();
        }
    });
}

// Track current open email for reply/forward/delete
let currentOpenEmailId = null;

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initializeEventListeners();
});

// Make functions available globally for Google API callbacks
window.gapiLoaded = gapiLoaded;
window.gisLoaded = gisLoaded;
