create schema if not exists cron;
create table if not exists cron.job(jobid serial primary key, jobname text, schedule text, command text);
create or replace function cron.schedule(n text, s text, c text) returns bigint language sql as $$ insert into cron.job(jobname,schedule,command) values (n,s,c) returning jobid::bigint $$;
create or replace function cron.unschedule(j bigint) returns boolean language sql as $$ delete from cron.job where jobid=j returning true $$;
