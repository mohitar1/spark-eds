-- User Logins Table
-- Stores user login data captured at authentication for reporting purposes

CREATE TABLE IF NOT EXISTS user_logins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Identifiers
  koid TEXT,                    -- KO ID (e.g., "S700855")
  email TEXT UNIQUE NOT NULL,   -- Primary key for upserts
  
  -- Profile fields
  full_name TEXT,               -- Original full name from Entra (session.name)
  first_name TEXT,              -- Parsed first name (best-effort split)
  last_name TEXT,               -- Parsed last name (best-effort split)
  title TEXT,                   -- Job title (if available)
  country TEXT,                 -- Country code
  employee_type TEXT,           -- User type (10=employee, 99=bottler, etc)
  company TEXT,                 -- Company name
  
  -- Authorization/Access (stored as pipe-delimited strings)
  roles TEXT,                   -- User roles: 'agency|bottler' etc.
  permissions TEXT,             -- Permissions: 'admin-reports|sudo|manage-rights' etc.
  
  -- Timestamps
  first_login_date TEXT NOT NULL,  -- ISO date of first login
  last_login_date TEXT NOT NULL,   -- ISO date of most recent login
  last_updated TEXT NOT NULL       -- ISO date of last profile update
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_email ON user_logins(email);
CREATE INDEX IF NOT EXISTS idx_koid ON user_logins(koid);
CREATE INDEX IF NOT EXISTS idx_first_login ON user_logins(first_login_date);
CREATE INDEX IF NOT EXISTS idx_roles ON user_logins(roles);
CREATE INDEX IF NOT EXISTS idx_permissions ON user_logins(permissions);
