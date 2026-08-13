-- Phase 1 system revision: rename Skype → Teams on application_form draft v2 only.
-- Published v1 has no Skype field and is intentionally untouched.
-- Draft rows are editable; immutability trigger only locks published/archived.

UPDATE document_template_versions AS v
SET body = replace(replace(v.body, '<td>SKYPE</td>', '<td>TEAMS</td>'), '{{skype}}', '{{teams}}')
FROM document_templates AS t
WHERE v.template_id = t.id
  AND t.slug = 'application_form'
  AND v.id = '741c13a9-7d8c-4e38-b231-51ea9c69bc48'
  AND v.version_no = 2
  AND v.status = 'draft'
  AND v.body LIKE '%<td>SKYPE</td>%'
  AND v.body LIKE '%{{skype}}%';
