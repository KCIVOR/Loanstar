-- Committee Accept email (SMTP). Editable by Superadmin; no loan terms required in v1.
INSERT INTO public.email_templates (slug, name, subject, body_html) VALUES
  (
    'application_approved',
    'Application Approved',
    'LoanStar — Application Approved',
    '<p>Dear {{borrower_name}},</p><p>Thank you for your loan application. We are pleased to inform you that your application has been approved.</p><p>Our team will contact you regarding the next steps.</p><p>If you have questions, please contact our office.</p><p>— LoanStar</p>'
  )
ON CONFLICT (slug) DO NOTHING;
