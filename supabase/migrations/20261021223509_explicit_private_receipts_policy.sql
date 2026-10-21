-- Bloqueio explícito para clientes; somente comandos internos privilegiados usam os recibos.
create policy receipts_no_client_access on private.command_receipts
for all to authenticated using (false) with check (false);
