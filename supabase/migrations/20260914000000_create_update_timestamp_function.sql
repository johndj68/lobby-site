-- Create update_timestamp() function for auto-updating updated_at columns
create or replace function update_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;
