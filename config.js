// ==========================================
// CONFIGURATION FILE
// Add your API keys here
// ==========================================

const CONFIG = {
    // Google OAuth Configuration
    GOOGLE_CLIENT_ID: '992504995990-kcdc1543k49pn3fh8808ih6mck74pd91.apps.googleusercontent.com',
    
    // Gmail API Scopes
    SCOPES: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
    
    // AI API Configuration (Choose one)
    // Option 1: OpenAI
    OPENAI_API_KEY: 'YOUR_OPENAI_API_KEY',
    
    // Option 2: Google Gemini
    GEMINI_API_KEY: 'YOUR_GEMINI_API_KEY',
    
    // Option 3: Anthropic Claude
    CLAUDE_API_KEY: 'YOUR_CLAUDE_API_KEY',
    
    // Which AI provider to use: 'openai', 'gemini', or 'claude'
    AI_PROVIDER: 'gemini',
    
    // Pagination settings
    EMAILS_PER_PAGE: 25,
    MAX_EMAILS_TO_FETCH: 500,
    
    // AI categorization keywords
    CATEGORIES: {
        urgent: ['urgent', 'asap', 'immediately', 'critical', 'emergency', 'deadline today', 'action required', 'time sensitive'],
        important: ['important', 'priority', 'attention', 'required', 'must', 'essential', 'crucial'],
        work: ['meeting', 'project', 'report', 'team', 'office', 'colleague', 'manager', 'deadline', 'review', 'schedule', 'presentation', 'client', 'invoice', 'contract'],
        personal: ['family', 'friend', 'birthday', 'dinner', 'weekend', 'vacation', 'trip', 'personal', 'mom', 'dad', 'brother', 'sister'],
        promotions: ['sale', 'discount', 'offer', 'deal', 'promo', 'save', 'limited time', 'exclusive', 'free shipping', 'coupon', 'clearance', '%off', 'buy now'],
        social: ['linkedin', 'twitter', 'facebook', 'instagram', 'notification', 'mentioned', 'tagged', 'comment', 'follow', 'connection', 'invite'],
        updates: ['update', 'notification', 'alert', 'reminder', 'confirm', 'verify', 'account', 'password', 'security', 'change'],
        finance: ['bank', 'payment', 'invoice', 'receipt', 'transaction', 'statement', 'credit', 'debit', 'transfer', 'balance', 'tax', 'investment'],
        newsletters: ['newsletter', 'subscribe', 'unsubscribe', 'weekly', 'digest', 'roundup', 'edition', 'issue'],
        spam: ['winner', 'congratulations', 'claim', 'prize', 'lottery', 'inheritance', 'nigerian', 'prince', 'million dollars']
    }
};
