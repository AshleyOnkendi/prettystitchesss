-- ==========================================================
-- 🚀 SIR'S 'N' SUITS - MASTER BACKEND SCRIPT (FULL RESET)
-- ==========================================================

-- 1. CLEANUP (Wipe everything to ensure a fresh canvas)
-- ==========================================================
DROP TRIGGER IF EXISTS on_payment_added ON public.payments;
DROP FUNCTION IF EXISTS update_order_paid_amount();
DROP TABLE IF EXISTS public.expenses CASCADE;
DROP TABLE IF EXISTS public.payments CASCADE;
DROP TABLE IF EXISTS public.orders CASCADE;
DROP TABLE IF EXISTS public.workers CASCADE;
DROP TABLE IF EXISTS public.user_profiles CASCADE;
DROP TABLE IF EXISTS public.shops CASCADE;


-- 2. CREATE DATABASE STRUCTURE (The Skeleton)
-- ==========================================================

-- 🏪 SHOPS
CREATE TABLE public.shops (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    location text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 👤 USER PROFILES (Links Supabase Login to App Data)
CREATE TABLE public.user_profiles (
    id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    full_name text,
    role text DEFAULT 'worker', -- Options: 'owner', 'manager', 'tailor'
    shop_id uuid REFERENCES public.shops(id) ON DELETE SET NULL, -- NULL = Owner (Global Access)
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 🧵 WORKERS (The Tailors/Staff members)
CREATE TABLE public.workers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id uuid REFERENCES public.shops(id) ON DELETE CASCADE,
    name text NOT NULL,
    role text DEFAULT 'tailor',
    phone_number text,
    status text DEFAULT 'active',
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 📦 ORDERS (The Core Business Data)
CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id uuid REFERENCES public.shops(id) ON DELETE CASCADE,
    manager_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    
    -- Client Details
    customer_name text NOT NULL,
    customer_phone text,
    
    -- Item Details
    garment_type text NOT NULL,
    measurements_details jsonb DEFAULT '{}'::jsonb, -- Stores custom measurements
    customer_preferences text, -- Notes
    
    -- Staff Assignment
    worker_id uuid REFERENCES public.workers(id) ON DELETE SET NULL, -- Main Tailor
    additional_workers jsonb DEFAULT '[]'::jsonb, -- The "Squad"
    
    -- Financials & Status
    price numeric DEFAULT 0,
    amount_paid numeric DEFAULT 0, -- Updated automatically
    status integer DEFAULT 1, -- 1: Assigned, 2: In Progress ... 6: Closed
    
    -- Dates
    due_date date,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- 💰 PAYMENTS (Transaction History)
CREATE TABLE public.payments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
    manager_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, -- Who took the cash
    amount numeric NOT NULL,
    payment_method text DEFAULT 'cash',
    notes text,
    recorded_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 💸 EXPENSES (Shop Costs)
CREATE TABLE public.expenses (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id uuid REFERENCES public.shops(id) ON DELETE CASCADE,
    manager_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    
    item_name text NOT NULL,
    amount numeric NOT NULL,
    category text DEFAULT 'General',
    notes text,
    incurred_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);


-- 3. ENABLE SECURITY (RLS Policies)
-- ==========================================================

ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- SIMPLE POLICY: "If you are logged in, you can do everything."
-- (Your App.js logic handles who sees what shop)
CREATE POLICY "Allow All for Auth Users" ON public.shops FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow All for Auth Users" ON public.user_profiles FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow All for Auth Users" ON public.workers FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow All for Auth Users" ON public.orders FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow All for Auth Users" ON public.payments FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow All for Auth Users" ON public.expenses FOR ALL USING (auth.role() = 'authenticated');

-- Public Access for Login Check (Required)
CREATE POLICY "Allow Public Read Profiles" ON public.user_profiles FOR SELECT TO anon USING (true);


-- 4. AUTOMATION (The Calculators)
-- ==========================================================

-- Trigger: Automatically update 'amount_paid' on Order when Payment is added
CREATE OR REPLACE FUNCTION update_order_paid_amount()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.orders
  SET amount_paid = (
    SELECT COALESCE(SUM(amount), 0)
    FROM public.payments
    WHERE order_id = NEW.order_id
  )
  WHERE id = NEW.order_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_payment_added
AFTER INSERT OR UPDATE OR DELETE ON public.payments
FOR EACH ROW EXECUTE PROCEDURE update_order_paid_amount();


-- 5. GRANT API PERMISSIONS (Crucial for App.js)
-- ==========================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;


-- 6. CREATE THE OWNER ACCOUNT
-- ==========================================================
-- 👇👇👇 EDIT THESE VALUES FOR YOUR NEW CLIENT 👇👇👇
DO $$
DECLARE
  client_email text := 'admin@sirs.com';  -- CHANGE THIS
  client_pass text := 'password123';      -- CHANGE THIS
  client_name text := 'Master Admin';     -- CHANGE THIS
  new_user_id uuid := gen_random_uuid();
BEGIN
  -- 1. Create Login
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000',
    new_user_id,
    'authenticated',
    'authenticated',
    client_email,
    crypt(client_pass, gen_salt('bf')),
    now(),
    jsonb_build_object('full_name', client_name),
    now(),
    now()
  );

  -- 2. Create Profile (Global Admin)
  INSERT INTO public.user_profiles (id, full_name, role, shop_id)
  VALUES (new_user_id, client_name, 'owner', NULL);
  
END $$;

SELECT '✅ Installation Complete. You can log in now.' as status;