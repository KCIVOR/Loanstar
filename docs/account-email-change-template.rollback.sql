-- Saved before the branded template update on 2026-10-27.
UPDATE public.email_templates
SET subject = 'Approve your account email change',
    body_html = '<p>A change to your account email was requested. The proposed email is <strong>{{newEmail}}</strong>.</p><p><a href="{{approvalUrl}}">Review and approve email change</a></p><p>This link expires in 30 minutes. If you did not request this, do not approve it.</p>',
    updated_at = now()
WHERE slug = 'account_email_change_current_approval'
RETURNING slug;
