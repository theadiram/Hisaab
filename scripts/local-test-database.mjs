// Existing CI uses the default project. Contributors can select an explicitly
// disposable project without renaming or resetting another local database.
export function localTestDatabaseContainer() {
  const name = process.env.HISAAB_TEST_DATABASE_CONTAINER ?? 'supabase_db_Hisaab';
  if (!/^supabase_db_[A-Za-z0-9_-]+$/.test(name)) {
    throw new Error('A local Supabase test container name is required.');
  }
  return name;
}
