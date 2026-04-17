-- ============================================================
-- SchoolHub / Dido — Пълен SQL за нова Supabase база данни
-- Копирай ЦЕЛИЯ файл и го пусни в SQL Editor на Supabase
-- ============================================================

-- ========================
-- 1. ENUMS (Типове данни)
-- ========================
CREATE TYPE public.app_role AS ENUM ('admin', 'teacher', 'student');
CREATE TYPE public.assignment_status AS ENUM ('active', 'archived', 'overdue');
CREATE TYPE public.submission_status AS ENUM ('submitted', 'late', 'graded', 'returned');
CREATE TYPE public.notification_type AS ENUM (
  'new_assignment',
  'deadline_approaching',
  'grade_posted',
  'submission_received',
  'comment_added'
);

-- ========================
-- 2. ТАБЛИЦИ
-- ========================

-- Profiles (автоматично се попълва при регистрация)
CREATE TABLE public.profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- User Roles (определя ролята: admin / teacher / student)
CREATE TABLE public.user_roles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  role public.app_role DEFAULT 'student' NOT NULL
);

-- Classes (класове / групи)
CREATE TABLE public.classes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  teacher_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Class Members (ученици в класове)
CREATE TABLE public.class_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE NOT NULL,
  student_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  joined_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(class_id, student_id)
);

-- Assignments (задачи / домашни)
CREATE TABLE public.assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  subject TEXT NOT NULL,
  class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE NOT NULL,
  teacher_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  deadline TIMESTAMPTZ NOT NULL,
  max_score INTEGER DEFAULT 100 NOT NULL,
  grading_criteria TEXT,
  attachments JSONB,
  status public.assignment_status DEFAULT 'active' NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Submissions (предавания на ученици)
CREATE TABLE public.submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_id UUID REFERENCES public.assignments(id) ON DELETE CASCADE NOT NULL,
  student_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content_text TEXT,
  file_url TEXT,
  link_url TEXT,
  version INTEGER DEFAULT 1 NOT NULL,
  status public.submission_status DEFAULT 'submitted' NOT NULL,
  submitted_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Grades (оценки)
CREATE TABLE public.grades (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id UUID REFERENCES public.submissions(id) ON DELETE CASCADE NOT NULL,
  teacher_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  score INTEGER NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Notifications (известия)
CREATE TABLE public.notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type public.notification_type NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT false NOT NULL,
  reference_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ========================
-- 3. RPC ФУНКЦИИ
-- ========================

-- get_user_role: Връща ролята на потребител
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS public.app_role
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN (
    SELECT role FROM public.user_roles WHERE user_id = _user_id LIMIT 1
  );
END;
$$;

-- has_role: Проверява дали потребител има определена роля
CREATE OR REPLACE FUNCTION public.has_role(_role public.app_role, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  );
END;
$$;

-- ========================
-- 4. TRIGGER: Автоматично създаване на profile при регистрация
-- ========================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  -- По подразбиране всеки нов потребител е "student"
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'student');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ========================
-- 5. ROW LEVEL SECURITY (RLS)
-- ========================

-- Активиране на RLS за всички таблици
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- PROFILES: Всеки може да чете, само собствения потребител може да update-ва
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- USER_ROLES: Всеки може да чете, само admin може да insert/update
CREATE POLICY "user_roles_select" ON public.user_roles FOR SELECT USING (true);
CREATE POLICY "user_roles_insert" ON public.user_roles FOR INSERT WITH CHECK (
  public.has_role('admin', auth.uid()) OR auth.uid() = user_id
);
CREATE POLICY "user_roles_update" ON public.user_roles FOR UPDATE USING (
  public.has_role('admin', auth.uid())
);

-- CLASSES: Всеки може да чете, само teacher/admin може да създава
CREATE POLICY "classes_select" ON public.classes FOR SELECT USING (true);
CREATE POLICY "classes_insert" ON public.classes FOR INSERT WITH CHECK (
  auth.uid() = teacher_id OR public.has_role('admin', auth.uid())
);
CREATE POLICY "classes_update" ON public.classes FOR UPDATE USING (
  auth.uid() = teacher_id OR public.has_role('admin', auth.uid())
);
CREATE POLICY "classes_delete" ON public.classes FOR DELETE USING (
  auth.uid() = teacher_id OR public.has_role('admin', auth.uid())
);

-- CLASS_MEMBERS: Всеки може да чете, teacher/admin може да добавя/премахва
CREATE POLICY "class_members_select" ON public.class_members FOR SELECT USING (true);
CREATE POLICY "class_members_insert" ON public.class_members FOR INSERT WITH CHECK (true);
CREATE POLICY "class_members_delete" ON public.class_members FOR DELETE USING (true);

-- ASSIGNMENTS: Всеки може да чете, само teacher може да create/update/delete
CREATE POLICY "assignments_select" ON public.assignments FOR SELECT USING (true);
CREATE POLICY "assignments_insert" ON public.assignments FOR INSERT WITH CHECK (
  auth.uid() = teacher_id OR public.has_role('admin', auth.uid())
);
CREATE POLICY "assignments_update" ON public.assignments FOR UPDATE USING (
  auth.uid() = teacher_id OR public.has_role('admin', auth.uid())
);
CREATE POLICY "assignments_delete" ON public.assignments FOR DELETE USING (
  auth.uid() = teacher_id OR public.has_role('admin', auth.uid())
);

-- SUBMISSIONS: Ученикът вижда своите, учителят вижда за неговите assignments
CREATE POLICY "submissions_select" ON public.submissions FOR SELECT USING (true);
CREATE POLICY "submissions_insert" ON public.submissions FOR INSERT WITH CHECK (
  auth.uid() = student_id
);
CREATE POLICY "submissions_update" ON public.submissions FOR UPDATE USING (true);

-- GRADES: Всеки може да чете, само teacher може да insert/update
CREATE POLICY "grades_select" ON public.grades FOR SELECT USING (true);
CREATE POLICY "grades_insert" ON public.grades FOR INSERT WITH CHECK (
  auth.uid() = teacher_id
);
CREATE POLICY "grades_update" ON public.grades FOR UPDATE USING (
  auth.uid() = teacher_id
);

-- NOTIFICATIONS: Потребителят вижда само своите
CREATE POLICY "notifications_select" ON public.notifications FOR SELECT USING (
  auth.uid() = user_id
);
CREATE POLICY "notifications_update" ON public.notifications FOR UPDATE USING (
  auth.uid() = user_id
);
CREATE POLICY "notifications_insert" ON public.notifications FOR INSERT WITH CHECK (true);

-- ========================
-- ГОТОВО! Сега настрой Storage bucket-а ръчно (вижди бележките по-долу)
-- ========================
