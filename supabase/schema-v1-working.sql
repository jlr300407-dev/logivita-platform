-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.ai_analyses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL UNIQUE,
  prompt_payload jsonb,
  analysis_text text,
  model_name text,
  status text NOT NULL DEFAULT 'pending'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ai_analyses_pkey PRIMARY KEY (id),
  CONSTRAINT ai_analyses_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.submissions(id)
);
CREATE TABLE public.email_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  submission_id uuid,
  recipient_email text,
  resend_id text,
  subject text,
  status USER-DEFINED NOT NULL DEFAULT 'pending'::email_status,
  error_message text,
  sent_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT email_logs_pkey PRIMARY KEY (id),
  CONSTRAINT email_logs_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.submissions(id)
);
CREATE TABLE public.intervention_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  rule_key text NOT NULL UNIQUE,
  area_key text NOT NULL,
  trigger_question_key text,
  trigger_answer_contains text,
  min_risk_points integer DEFAULT 0,
  max_area_score numeric DEFAULT 100,
  intervention_title text NOT NULL,
  intervention_text text NOT NULL,
  why_it_matters text NOT NULL,
  effort_level text NOT NULL DEFAULT 'leicht'::text,
  time_frame text NOT NULL DEFAULT '7 Tage'::text,
  priority integer NOT NULL DEFAULT 10,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT intervention_rules_pkey PRIMARY KEY (id)
);
CREATE TABLE public.public_content_blocks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  block_key text NOT NULL UNIQUE,
  category text NOT NULL,
  title text,
  content text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT public_content_blocks_pkey PRIMARY KEY (id)
);
CREATE TABLE public.question_options (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL,
  option_key text NOT NULL,
  option_text text NOT NULL,
  risk_points integer NOT NULL CHECK (risk_points >= 0 AND risk_points <= 4),
  sort_order integer NOT NULL,
  trigger_doctor_hint boolean NOT NULL DEFAULT false,
  trigger_bloodtest_hint boolean NOT NULL DEFAULT false,
  trigger_coaching_hint boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT question_options_pkey PRIMARY KEY (id),
  CONSTRAINT question_options_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id)
);
CREATE TABLE public.questionnaire_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  version_key text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT questionnaire_versions_pkey PRIMARY KEY (id)
);
CREATE TABLE public.questions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL,
  question_key text NOT NULL,
  area_key text,
  question_text text NOT NULL,
  help_text text,
  question_type text NOT NULL DEFAULT 'single_choice'::text,
  is_medically_relevant boolean NOT NULL DEFAULT true,
  is_required boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT questions_pkey PRIMARY KEY (id),
  CONSTRAINT questions_version_id_fkey FOREIGN KEY (version_id) REFERENCES public.questionnaire_versions(id),
  CONSTRAINT questions_area_key_fkey FOREIGN KEY (area_key) REFERENCES public.score_areas(area_key)
);
CREATE TABLE public.score_areas (
  area_key text NOT NULL,
  label text NOT NULL,
  description text,
  weight numeric NOT NULL CHECK (weight > 0::numeric),
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT score_areas_pkey PRIMARY KEY (area_key)
);
CREATE TABLE public.submission_answers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL,
  question_id uuid,
  question_key text NOT NULL,
  area_key text,
  option_id uuid,
  answer_text text NOT NULL,
  risk_points integer NOT NULL CHECK (risk_points >= 0 AND risk_points <= 4),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT submission_answers_pkey PRIMARY KEY (id),
  CONSTRAINT submission_answers_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.submissions(id),
  CONSTRAINT submission_answers_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id),
  CONSTRAINT submission_answers_option_id_fkey FOREIGN KEY (option_id) REFERENCES public.question_options(id)
);
CREATE TABLE public.submission_consents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL,
  consent_privacy boolean NOT NULL,
  consent_storage boolean NOT NULL,
  consent_ai_analysis boolean NOT NULL DEFAULT false,
  consent_email_delivery boolean NOT NULL DEFAULT false,
  consent_version text NOT NULL,
  consent_text_snapshot text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT submission_consents_pkey PRIMARY KEY (id),
  CONSTRAINT submission_consents_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.submissions(id)
);
CREATE TABLE public.submission_contacts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL UNIQUE,
  email text,
  first_name text,
  last_name text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT submission_contacts_pkey PRIMARY KEY (id),
  CONSTRAINT submission_contacts_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.submissions(id)
);
CREATE TABLE public.submission_scores (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL UNIQUE,
  total_score numeric NOT NULL,
  score_label text NOT NULL,
  score_payload jsonb NOT NULL,
  top_priorities jsonb NOT NULL,
  doctor_hint boolean NOT NULL DEFAULT false,
  bloodtest_hint boolean NOT NULL DEFAULT false,
  coaching_hint boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT submission_scores_pkey PRIMARY KEY (id),
  CONSTRAINT submission_scores_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.submissions(id)
);
CREATE TABLE public.submissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  public_code text NOT NULL UNIQUE,
  questionnaire_version_id uuid,
  status USER-DEFINED NOT NULL DEFAULT 'created'::submission_status,
  age integer NOT NULL CHECK (age >= 14 AND age <= 100),
  gender text NOT NULL CHECK (gender = ANY (ARRAY['weiblich'::text, 'männlich'::text, 'divers'::text, 'keine_angabe'::text])),
  height_cm integer NOT NULL CHECK (height_cm >= 120 AND height_cm <= 230),
  weight_kg numeric NOT NULL CHECK (weight_kg >= 35::numeric AND weight_kg <= 250::numeric),
  bmi numeric,
  wants_ai_analysis boolean NOT NULL DEFAULT false,
  source text DEFAULT 'pencode'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT submissions_pkey PRIMARY KEY (id),
  CONSTRAINT submissions_questionnaire_version_id_fkey FOREIGN KEY (questionnaire_version_id) REFERENCES public.questionnaire_versions(id)
);
CREATE TABLE public.supplement_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  rule_key text NOT NULL UNIQUE,
  supplement_key text NOT NULL,
  supplement_label text NOT NULL,
  trigger_area text,
  trigger_question_key text,
  trigger_answer_contains text,
  min_risk_points integer DEFAULT 0,
  priority integer NOT NULL DEFAULT 10,
  reason_text text NOT NULL,
  bloodtest_relevant boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT supplement_rules_pkey PRIMARY KEY (id)
);