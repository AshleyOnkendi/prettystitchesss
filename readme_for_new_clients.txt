===================================================================
   🚀 RM-POS MASTER DEPLOYMENT GUIDE (INTERNAL USE ONLY)
   "How to Launch a New Client System in 10 Minutes"
===================================================================

PHASE 1: THE BACKEND (Supabase)
-------------------------------------------------------------------
1. Go to Supabase (supabase.com) and click "New Project".
2. Name it after the client (e.g., "Maina Stitching DB").
3. Set a strong password (save it immediately).
4. Select Region: "Africa (Cape Town)" or nearest.
5. Wait for the database to build (approx 2 mins).

6. RUN THE MASTER SCRIPT:
   a. Click "SQL Editor" (Icon on the left).
   b. Paste the contents of "MASTER_DB_SCRIPT.sql".
   c. Click "RUN" (Bottom right).
   d. Confirm "Success" message.

7. GET THE API KEYS:
   a. Go to Settings (Cog Icon) > API.
   b. Copy "Project URL".
   c. Copy "anon" public key.
   d. Copy "service_role" secret key (Click 'Reveal').

PHASE 2: THE FRONTEND (Code Config)
-------------------------------------------------------------------
1. Copy your "RM-POS-MASTER" folder on your laptop.
2. Paste it and rename it (e.g., "Client_Maina").
3. Open the folder > Open "config.js" in VS Code.

4. EDIT THE 4 CRITICAL SECTIONS:
   
   const APP_CONFIG = {
       appName: "Maina's Stitching",      <-- Client Name
       shopPhone: "0712 345 678",         <-- Client Phone
       
       supabaseUrl: "https://...",        <-- PASTE NEW URL
       supabaseKey: "eyJ...",             <-- PASTE NEW ANON KEY
       
       serviceRoleKey: "eyJ..."           <-- PASTE NEW SERVICE ROLE KEY
   };

5. SAVE the file.

PHASE 3: ADMIN SETUP (First Time Login)
-------------------------------------------------------------------
1. Open "index.html" in your browser (Live Server).
2. You will see the login screen.
3. Since the database is empty, you need to create the System Owner.
   
   *Option A (SQL Way - Faster):*
   Go back to Supabase SQL Editor and run:
   
   INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
   VALUES ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'admin@client.com', crypt('password123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"System Admin","role":"owner"}', now(), now(), '', '', '', '');
   
   *Option B (App Way):*
   If you built a sign-up page, use that.

4. Log in with the email/password you just created.
5. Go to "Admin Dashboard" > "Management".
6. Click "Add New Shop" (e.g., "CBD Branch").
7. Click "Add Manager" to create the login details for the client.

PHASE 4: LAUNCH (Go Live)
-------------------------------------------------------------------
1. Go to Netlify (netlify.com).
2. Drag and drop the "Client_Maina" folder into the upload box.
3. Wait for the link (e.g., "modest-turing-12345.netlify.app").
4. (Optional) Rename the site to "maina-stitching.netlify.app".
5. Send the link + Manager Username/Password to the client on WhatsApp.

-------------------------------------------------------------------
TROUBLESHOOTING CHEATSHEET
-------------------------------------------------------------------
- "Error loading user": You likely forgot to run the SQL script.
- "Config not loaded": Check index.html, ensure config.js is ABOVE app.js.
- "Receipt shows 0 paid": Ensure the Trigger was installed in SQL phase.
- "User not allowed": You forgot to put the 'serviceRoleKey' in config.js.
Client Refuses to Pay:

Open config.js on your laptop.

Change line 8 to: SYSTEM_STATUS: "SUSPENDED".

Save.

Drag and drop your project folder to Netlify again.