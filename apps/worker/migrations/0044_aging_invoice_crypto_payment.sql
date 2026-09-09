-- NOWPayments crypto payment option for aging invoices (chase's unpaid-invoice list).
-- payment_method is 'crypto' once a NOWPayments invoice has been generated for this row;
-- payment_url is that invoice's hosted checkout URL (QR + link). Marking paid still goes
-- through the same status/paid_at columns the manual mark-paid flow already uses.
ALTER TABLE aging_invoices ADD COLUMN payment_method TEXT;
ALTER TABLE aging_invoices ADD COLUMN payment_url TEXT;
