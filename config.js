// ==========================================
// ⚙️ MASTER CONFIGURATION FILE
// ==========================================

const APP_CONFIG = {
    // === 1. CONTROL SWITCH (THE KILL SWITCH) ===
    // Options: "ACTIVE" (App works) or "SUSPENDED" (Shows Payment Screen)
    SYSTEM_STATUS: "ACTIVE", 

    // === 2. PAYMENT & SUPPORT DETAILS (For the Lock Screen) ===
    billing: {
        mpesaNumber: "0745806488",
        tillNumber: "4056724",
        supportPhone: "0745806488"
    },

    // === 3. BRANDING IDENTITY ===
    appName: "PRETTY STITCHES",       
    appSubtitle: "BY RONNY",         
    logoPath: "logo.png",             

    // === 4. CONTACT DETAILS (For Receipts) ===
    shopPhone: "0700153959",       
    currencySymbol: "Ksh",            

    // === 5. BACKEND CONNECTION (Supabase) ===
    supabaseUrl: "https://xgzapsnjhxvtzcydlooa.supabase.co", 
    supabaseKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhnemFwc25qaHh2dHpjeWRsb29hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5Njg1NzgsImV4cCI6MjA4MTU0NDU3OH0.0KUjOzju0uWdbYnAKJCBVcGuP5e1Y6rw6wjKIN5N0DA",
    serviceRoleKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhnemFwc25qaHh2dHpjeWRsb29hIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTk2ODU3OCwiZXhwIjoyMDgxNTQ0NTc4fQ.1hug4gSGBhue923emxdnyqXGYWMZp4qIHv2JgAPEWGQ"
};