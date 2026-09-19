alter table client_projects drop constraint if exists client_projects_priority_check;
alter table client_projects add constraint client_projects_priority_check
  check (priority in ('baixa', 'normal', 'alta', 'urgente'));
