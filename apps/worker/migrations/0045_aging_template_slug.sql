-- Slug of a docstoc document template attached to a "Get paid" payment request (see the new
-- /get-paid page). Unused (NULL) for aging_invoices rows created by the overdue-chase flow.
ALTER TABLE aging_invoices ADD COLUMN template_slug TEXT;
