begin;

alter table public.team_profiles
  add column work_status text check (char_length(work_status) between 1 and 60 and work_status = btrim(work_status)),
  add column workload smallint check (workload between 1 and 10),
  add column mood smallint check (mood between 1 and 10);

notify pgrst, 'reload schema';
commit;
