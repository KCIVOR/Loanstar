-- Phase 2 of sme-dedicated-application-forms-implementation-plan.md
-- Additive only: two new published SME application-form templates.
-- Does NOT modify the Seafarer slug `application_form`.

-- --------------------------------------------------------------------------
-- SME Individual Loan Application
-- --------------------------------------------------------------------------
WITH t AS (
  INSERT INTO public.document_templates (slug, name, description, category)
  VALUES (
    'application_form_sme_individual',
    'SME Individual Loan Application',
    'Printable Individual / Sole Prop application form (client: Individual Application Form LSLG v.4).',
    'intake'
  )
  ON CONFLICT (slug) DO UPDATE
    SET name = EXCLUDED.name,
        description = EXCLUDED.description,
        category = EXCLUDED.category
  RETURNING id
)
INSERT INTO public.document_template_versions (template_id, version_no, body, status, published_at)
SELECT id, 1, $body$
<div style="text-align:center"><h2>{{companyName}}</h2></div>
<h3 style="text-align:center">INDIVIDUAL LOAN APPLICATION</h3>

<table style="width:100%;border-collapse:collapse" border="1" cellpadding="4"><tbody>
<tr>
  <td><b>Date Applied</b><br/>{{dateApplied}}</td>
  <td><b>Type Of Loan</b><br/>{{typeOfLoan}}</td>
  <td><b>Loan Desired</b><br/>{{loanDesired}}</td>
  <td><b>Sales Agent</b><br/>{{salesAgent}}</td>
</tr>
</tbody></table>

<p><b>IMPORTANT:</b> PLEASE FILL UP THIS FORM TO FACILITATE YOUR LOAN APPLICATION, PUT N/A IF NOT APPLICABLE</p>

<h4>I. APPLICANT DATA</h4>
<table style="width:100%;border-collapse:collapse" border="1" cellpadding="4"><tbody>
<tr>
  <td><b>Last Name</b><br/>{{lastName}}</td>
  <td><b>First Name</b><br/>{{firstName}}</td>
  <td><b>Middle Name</b><br/>{{middleName}}</td>
  <td><b>Status</b><br/>{{civilStatus}}</td>
</tr>
<tr>
  <td colspan="2"><b>Present Address</b><br/>{{presentAddress}}</td>
  <td><b>Ownership</b><br/>{{presentOwnership}}</td>
  <td><b>Yrs of Stay</b><br/>{{presentLengthOfStay}}</td>
</tr>
<tr>
  <td colspan="2"><b>Provincial Address</b><br/>{{permanentAddress}}</td>
  <td><b>Ownership</b><br/>{{permanentOwnership}}</td>
  <td><b>Yrs of Stay</b><br/>{{permanentLengthOfStay}}</td>
</tr>
<tr>
  <td><b>Place of Birth</b><br/>{{placeOfBirth}}</td>
  <td><b>Birth Date</b><br/>{{dateOfBirth}}</td>
  <td><b>Landline</b><br/>{{landline}}</td>
  <td><b>Mobile Number</b><br/>{{mobileNumber}}</td>
</tr>
<tr>
  <td colspan="2"><b>Email Address</b><br/>{{email}}</td>
  <td colspan="2"><b>No. of Dependents</b><br/>{{noOfDependents}}</td>
</tr>
</tbody></table>

<p><b>Dependents</b></p>
<table style="width:100%;border-collapse:collapse" border="1" cellpadding="4"><tbody>
<tr><th>Name</th><th>Age</th><th>School Attended / If Working Employer&apos;s Name</th></tr>
<tr data-repeat="dependents"><td>{{name}}</td><td>{{age}}</td><td>{{occupation}}</td></tr>
</tbody></table>

<p><b>Employment / Business</b></p>
<table style="width:100%;border-collapse:collapse" border="1" cellpadding="4"><tbody>
<tr>
  <td colspan="2"><b>Company or Employer&apos;s Name</b><br/>{{businessCompanyName}}</td>
  <td colspan="2"><b>Company Address</b><br/>{{businessAddress}}</td>
</tr>
<tr>
  <td><b>Contact Number</b><br/>{{businessContactNumber}}</td>
  <td><b>Position</b><br/>{{businessPosition}}</td>
  <td><b>Yrs of Stay</b><br/>{{businessYearsOfStay}}</td>
  <td><b>Yrs of Operation</b><br/>{{businessYearsOfOperation}}</td>
</tr>
<tr>
  <td colspan="2"><b>Email Address</b><br/>{{businessEmail}}</td>
  <td colspan="2"><b>Website Address</b><br/>{{businessWebsite}}</td>
</tr>
<tr>
  <td colspan="2"><b>Previous Employer</b><br/>{{previousEmployer}}</td>
  <td colspan="2"><b>Company Address</b><br/>{{previousCompanyAddress}}</td>
</tr>
<tr>
  <td colspan="2"><b>Yrs of Stay</b><br/>{{previousYearsOfStay}}</td>
  <td colspan="2"><b>Contact Number</b><br/>{{previousContactNumber}}</td>
</tr>
</tbody></table>

<h4>II. SPOUSE INFORMATION</h4>
<table style="width:100%;border-collapse:collapse" border="1" cellpadding="4"><tbody>
<tr>
  <td><b>Last Name</b><br/>{{spouseLastName}}</td>
  <td><b>First Name</b><br/>{{spouseFirstName}}</td>
  <td><b>Middle Name</b><br/>{{spouseMiddleName}}</td>
  <td><b>Date of Birth</b><br/>{{spouseDateOfBirth}}</td>
</tr>
<tr>
  <td colspan="3"><b>Present Address</b><br/>{{spousePresentAddress}}</td>
  <td><b>Yrs of Stay</b><br/>{{spouseYearsOfStayPresent}}</td>
</tr>
<tr>
  <td colspan="3"><b>Provincial Address</b><br/>{{spouseProvincialAddress}}</td>
  <td><b>Yrs of Stay</b><br/>{{spouseYearsOfStayProvincial}}</td>
</tr>
<tr>
  <td colspan="2"><b>Company or Employer&apos;s Name</b><br/>{{spouseCompanyName}}</td>
  <td><b>Yrs of Stay</b><br/>{{spouseYearsOfStayCompany}}</td>
  <td><b>Position</b><br/>{{spousePosition}}</td>
</tr>
<tr>
  <td colspan="2"><b>Contact Number</b><br/>{{spouseContactNumber}}</td>
  <td colspan="2"><b>Company Address</b><br/>{{spouseCompanyAddress}}</td>
</tr>
</tbody></table>

<h4>III. REFERENCES — Required 2 relatives and 2 not relatives</h4>
<table style="width:100%;border-collapse:collapse" border="1" cellpadding="4"><tbody>
<tr><th>Name</th><th>Address</th><th>Relation</th><th>Contact Number</th></tr>
<tr data-repeat="references"><td>{{name}}</td><td>{{address}}</td><td>{{relationship}}</td><td>{{phone}}</td></tr>
</tbody></table>
<table style="width:100%;border-collapse:collapse;margin-top:6px" border="1" cellpadding="4"><tbody>
<tr>
  <td><b>Relatives Living in Province</b><br/>{{relativesLivingInProvince}}</td>
  <td><b>Address</b><br/>{{relativesLivingInProvinceAddress}}</td>
  <td><b>Contact Number</b><br/>{{relativesLivingInProvinceContact}}</td>
</tr>
</tbody></table>

<h4>IV. INCOME DECLARATION</h4>
<table style="width:100%;border-collapse:collapse" border="1" cellpadding="4"><tbody>
<tr>
  <th>Own Monthly Income</th>
  <th>Spouse&apos;s Monthly Income</th>
  <th>Other Income</th>
</tr>
<tr>
  <td><b>Gross Income</b><br/>{{ownGrossIncome}}</td>
  <td><b>Gross Income</b><br/>{{spouseGrossIncome}}</td>
  <td><b>Source of Income</b><br/>{{otherIncomeSource}}</td>
</tr>
<tr>
  <td><b>Less Expenses</b><br/>{{ownLessExpenses}}</td>
  <td><b>Less Expenses</b><br/>{{spouseLessExpenses}}</td>
  <td><b>Monthly Income</b><br/>{{otherMonthlyIncome}}</td>
</tr>
<tr>
  <td><b>Net Income</b><br/>{{ownNetIncome}}</td>
  <td><b>Net Income</b><br/>{{spouseNetIncome}}</td>
  <td><b>Total Net Income</b><br/>{{totalNetIncome}}</td>
</tr>
</tbody></table>

<p style="font-size:11px;margin-top:12px">I certify that the statements on this application are correct and complete. By filling out this form, I agree that the details I provided, including but not limited to my name, address, phone number, email, and other information, personal or otherwise, will be collected by LOAN STAR LENDING GROUP CORP. to process my loan application. The use of the information shall be under applicable laws, rules, and regulations of the Republic of the Philippines. I also authorized the company to conduct phone and field verification with all the information I provided. I agree that this application may remain your property whether or not this credit application is approved.</p>

<table style="width:100%;margin-top:16px"><tbody><tr>
<td style="width:50%;vertical-align:top">
  ____________________________<br/>
  <b>BORROWER&apos;S SIGNATURE OVER PRINTED NAME</b><br/>
  {{borrowerName}}<br/>
  <b>Date:</b> {{applicationDate}}
</td>
<td style="width:50%;vertical-align:top">
  ____________________________<br/>
  <b>CO-BORROWER&apos;S SIGNATURE OVER PRINTED NAME</b><br/>
  {{coBorrowerName}}<br/>
  <b>Date:</b> {{applicationDate}}
</td>
</tr></tbody></table>
$body$, 'published', now()
FROM t
WHERE NOT EXISTS (
  SELECT 1 FROM public.document_template_versions v
  WHERE v.template_id = t.id AND v.version_no = 1
);

-- --------------------------------------------------------------------------
-- SME Corporate Loan Application
-- --------------------------------------------------------------------------
WITH t AS (
  INSERT INTO public.document_templates (slug, name, description, category)
  VALUES (
    'application_form_sme_corporate',
    'SME Corporate Loan Application',
    'Printable Corporate application form (client: Business Application LSLG v.4).',
    'intake'
  )
  ON CONFLICT (slug) DO UPDATE
    SET name = EXCLUDED.name,
        description = EXCLUDED.description,
        category = EXCLUDED.category
  RETURNING id
)
INSERT INTO public.document_template_versions (template_id, version_no, body, status, published_at)
SELECT id, 1, $body$
<div style="text-align:center"><h2>{{companyName}}</h2></div>
<h3 style="text-align:center">CORPORATE LOAN APPLICATION</h3>

<table style="width:100%;border-collapse:collapse" border="1" cellpadding="4"><tbody>
<tr>
  <td><b>Date Applied</b><br/>{{dateApplied}}</td>
  <td><b>Type Of Loan</b><br/>{{typeOfLoan}}</td>
  <td><b>Loan Desired</b><br/>{{loanDesired}}</td>
  <td><b>Sales Agent</b><br/>{{salesAgent}}</td>
</tr>
</tbody></table>

<p><b>IMPORTANT:</b> PLEASE FILL UP THIS FORM TO FACILITATE YOUR LOAN APPLICATION, PUT N/A IF NOT APPLICABLE</p>

<h4>FACTS ABOUT THE COMPANY</h4>
<table style="width:100%;border-collapse:collapse" border="1" cellpadding="4"><tbody>
<tr>
  <td><b>Name of Company</b><br/>{{businessCompanyName}}</td>
  <td><b>Acronym</b><br/>{{businessAcronym}}</td>
</tr>
<tr>
  <td><b>Office Address</b><br/>{{businessAddress}}</td>
  <td><b>Landline Nos.</b><br/>{{businessLandline}}</td>
</tr>
<tr>
  <td><b>Nature of Business</b><br/>{{businessNature}}</td>
  <td><b>Mobile Nos.</b><br/>{{businessMobile}}</td>
</tr>
<tr>
  <td><b>No. of Branches</b><br/>{{businessBranches}}</td>
  <td><b>Fax No.</b><br/>{{businessFax}}</td>
</tr>
<tr>
  <td><b>E-mail Address</b><br/>{{businessEmail}}</td>
  <td><b>Date Established</b><br/>{{businessDateEstablished}}</td>
</tr>
<tr>
  <td><b>TIN</b><br/>{{businessTin}}</td>
  <td><b>No. of Employees</b><br/>{{businessEmployees}}</td>
</tr>
<tr>
  <td colspan="2"><b>Website</b><br/>{{businessWebsite}}</td>
</tr>
</tbody></table>

<h4>COMPANY OFFICERS</h4>
<table style="width:100%;border-collapse:collapse" border="1" cellpadding="4"><tbody>
<tr><th>Name</th><th>Address</th><th>Position</th></tr>
<tr data-repeat="companyOfficers"><td>{{name}}</td><td>{{address}}</td><td>{{position}}</td></tr>
</tbody></table>

<h4>MAJOR STOCKHOLDERS</h4>
<table style="width:100%;border-collapse:collapse" border="1" cellpadding="4"><tbody>
<tr><th>Name</th><th>Address</th><th>Position</th><th>Equity</th></tr>
<tr data-repeat="majorStockholders"><td>{{name}}</td><td>{{address}}</td><td>{{position}}</td><td>{{equity}}</td></tr>
</tbody></table>

<h4>TRADE REFERENCES</h4>
<p><b>Customer / Client</b></p>
<table style="width:100%;border-collapse:collapse" border="1" cellpadding="4"><tbody>
<tr><th>Customer / Client</th><th>Address</th><th>Contact Person</th><th>Contact No.</th></tr>
<tr data-repeat="tradeCustomers"><td>{{name}}</td><td>{{address}}</td><td>{{contactPerson}}</td><td>{{contactNo}}</td></tr>
</tbody></table>
<p><b>Supplier</b></p>
<table style="width:100%;border-collapse:collapse" border="1" cellpadding="4"><tbody>
<tr><th>Supplier</th><th>Address</th><th>Contact Person</th><th>Contact No.</th></tr>
<tr data-repeat="tradeSuppliers"><td>{{name}}</td><td>{{address}}</td><td>{{contactPerson}}</td><td>{{contactNo}}</td></tr>
</tbody></table>

<h4>CREDIT REFERENCES</h4>
<table style="width:100%;border-collapse:collapse" border="1" cellpadding="4"><tbody>
<tr><th>Creditors / Banks</th><th>Type of Loan</th><th>Outstanding Balance</th><th>Monthly Payment</th><th>Contact No.</th></tr>
<tr data-repeat="creditReferences"><td>{{creditorBank}}</td><td>{{typeOfLoan}}</td><td>{{outstandingBalance}}</td><td>{{monthlyPayment}}</td><td>{{contactNo}}</td></tr>
</tbody></table>

<h4>BANK ACCOUNTS</h4>
<table style="width:100%;border-collapse:collapse" border="1" cellpadding="4"><tbody>
<tr><th>Bank Name</th><th>Branch</th><th>Account No.</th><th>Account Type</th><th>Contact No.</th></tr>
<tr data-repeat="bankAccounts"><td>{{bankName}}</td><td>{{branch}}</td><td>{{accountNo}}</td><td>{{accountType}}</td><td>{{contactNo}}</td></tr>
</tbody></table>

<p style="font-size:11px;margin-top:12px">I certify that the statements on this application are correct and complete. By filling out this form, I agree that the details I provided, including but not limited to my name, address, phone number, email, and other information, personal or otherwise, will be collected by LOAN STAR LENDING GROUP CORP. to process my loan application. The use of the information shall be under applicable laws, rules, and regulations of the Republic of the Philippines. I also authorized the company to conduct phone and field verification with all the information I provided. I agree that this application may remain your property whether or not this credit application is approved.</p>

<p style="font-size:11px">This is to Authorize Loan Star Lending Group Corp. or its authorized representative to verify my/our savings/checking account with your bank. You are allowed to disclose the date of opening of my/our savings/checking account, the handling, and the average daily balance (ADB) for the last six months.</p>

<p><b>Bank Name and Account Number</b><br/>{{bankAuthorizationAccount}}</p>

<h4>REQUIREMENTS</h4>
<ol style="font-size:12px">
  <li>SEC Registration, Articles of Incorporation and By-Laws (GIS)</li>
  <li>Company profile</li>
  <li>At least two (2) years of financial statement W/ ITR</li>
  <li>Six (6) months latest bank statement</li>
  <li>Two (2) valid ID of Official Representative</li>
  <li>TIN and CTC of the company and representative/s</li>
  <li>Board Resolution and Secretary Certificate to avail loan</li>
  <li>Business proof of billing</li>
  <li>Location Sketch</li>
</ol>

<p style="margin-top:24px;text-align:right">
  ____________________________<br/>
  <b>Signature Over Printed Name</b><br/>
  {{borrowerName}}
</p>
$body$, 'published', now()
FROM t
WHERE NOT EXISTS (
  SELECT 1 FROM public.document_template_versions v
  WHERE v.template_id = t.id AND v.version_no = 1
);
