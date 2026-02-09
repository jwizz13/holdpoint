-- ============================================
-- HoldPoint — Supabase Database Schema
-- Run this in your Supabase SQL Editor
-- ============================================

-- 1. Profiles table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Session history table
CREATE TABLE IF NOT EXISTS session_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  routine_name TEXT NOT NULL,
  duration_min INTEGER DEFAULT 0,
  core_time INTEGER DEFAULT 5,
  completed TEXT,
  type TEXT DEFAULT 'yoga',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Custom routines table
CREATE TABLE IF NOT EXISTS custom_routines (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  focus TEXT DEFAULT '',
  type TEXT DEFAULT 'yoga',
  poses JSONB NOT NULL DEFAULT '[]',
  is_public BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Community routines (shared by users)
CREATE TABLE IF NOT EXISTS community_routines (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  creator_name TEXT DEFAULT 'Anonymous',
  name TEXT NOT NULL,
  focus TEXT DEFAULT '',
  type TEXT DEFAULT 'yoga',
  poses JSONB NOT NULL DEFAULT '[]',
  description TEXT DEFAULT '',
  add_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. User settings table
CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  core_pose_minutes INTEGER DEFAULT 5,
  bell_enabled BOOLEAN DEFAULT TRUE,
  wake_lock_enabled BOOLEAN DEFAULT TRUE,
  sheets_enabled BOOLEAN DEFAULT FALSE,
  sheet_id TEXT DEFAULT '',
  sheet_tab TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Row Level Security (RLS) — users can only
-- access their own data
-- ============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_routines ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_routines ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read/update their own
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Session history: users can CRUD their own
CREATE POLICY "Users can view own sessions"
  ON session_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sessions"
  ON session_history FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own sessions"
  ON session_history FOR DELETE USING (auth.uid() = user_id);

-- Custom routines: users can CRUD their own
CREATE POLICY "Users can view own routines"
  ON custom_routines FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own routines"
  ON custom_routines FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own routines"
  ON custom_routines FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own routines"
  ON custom_routines FOR DELETE USING (auth.uid() = user_id);

-- Community routines: anyone can read, creators can manage
CREATE POLICY "Anyone can view community routines"
  ON community_routines FOR SELECT USING (true);
CREATE POLICY "Users can insert community routines"
  ON community_routines FOR INSERT WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "Creators can update own community routines"
  ON community_routines FOR UPDATE USING (auth.uid() = creator_id);
CREATE POLICY "Creators can delete own community routines"
  ON community_routines FOR DELETE USING (auth.uid() = creator_id);

-- User settings: users can CRUD their own
CREATE POLICY "Users can view own settings"
  ON user_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own settings"
  ON user_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own settings"
  ON user_settings FOR UPDATE USING (auth.uid() = user_id);

-- ============================================
-- Auto-create profile on signup
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists, then create
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- Indexes for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_session_history_user ON session_history(user_id);
CREATE INDEX IF NOT EXISTS idx_session_history_date ON session_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_custom_routines_user ON custom_routines(user_id);
CREATE INDEX IF NOT EXISTS idx_community_routines_date ON community_routines(created_at DESC);
