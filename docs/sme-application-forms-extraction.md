# SME Application Forms — Field Extraction

**Source files (client originals):**
- `Individual Application Form LSLG v.4.pdf` — **Individual / Sole Prop** (1 page, 90 fillable fields)
- `Business Application LSLG v.4.pdf` — **Corporate** (1 page, 104 fillable widgets / 62 named fields)

**Extracted:** 2026-08-07  
**Page size (both):** Letter-tall custom — 612 × 936 pt  
**Method:** AcroForm widgets + text labels + visual page preview

> These are **two different forms**. Do not reuse the Seafarer application form layout for either. The system currently still prints the Seafarer template and only substitutes SME values into shared slots — that is temporary.

---

## Form A — Individual Loan Application

### Header
| Field | Notes |
|---|---|
| Date Applied | Text |
| Type Of Loan | Dropdown: Business Loan / Auto Loan / RE Mortgage / MPL (default Business Loan) |
| Loan Desired | Text |
| Sales Agent | Text |

Instruction line: *IMPORTANT: PLEASE FILL UP THIS FORM… PUT N/A IF NOT APPLICABLE*

### I. Applicant Data
| Field | Notes |
|---|---|
| Last Name / First Name / Middle Name | |
| Status | Civil status |
| Present Address | |
| Ownership (Present) | Dropdown: Owned / Owned (Mortgage) / Rented / Parent Owned / Used free |
| Yrs of Stay (Present) | |
| Provincial Address | |
| Ownership (Provincial) | Same dropdown |
| Yrs of Stay (Provincial) | |
| Place of Birth | |
| Birth Date | |
| Landline | |
| Mobile Number | |
| Email Address | |
| No. of Dependents | |

**Dependents table — 4 rows × 3 columns**
| Name | Age | School Attended / If Working Employer's Name |

**Employment / business block**
| Field |
|---|
| Company or Employer's Name |
| Company Address |
| Contact Number |
| Position |
| Yrs of Stay |
| Yrs of Operation |
| Email Address (company) |
| Website Address |
| Previous Employer |
| Previous Company Address |
| Yrs of Stay (previous) |
| Contact Number (previous) |

### II. Spouse Information
| Field |
|---|
| Last Name / First Name / Middle Name |
| Date of Birth |
| Present Address + Yrs of Stay |
| Provincial Address + Yrs of Stay |
| Company or Employer's Name |
| Yrs of Stay (company) |
| Position |
| Contact Number |
| Company Address |

### III. References — Required 2 relatives and 2 not relatives
**References table — 4 rows × 4 columns**
| Name | Address | Relation | Contact Number |

Plus one extra row:
| Relatives Living in Province | Address | Contact Number |

### IV. Income Declaration (3 columns)
| Own Monthly Income | Spouse's Monthly Income | Other Income |
|---|---|---|
| Gross Income | Gross Income | Source of Income |
| Less Expenses | Less Expenses | Monthly Income |
| Net Income | Net Income | **Total Net Income** (form shows 0.00) |

### Footer
- Consent / privacy / verification authorization paragraph (Loan Star Lending Group Corp.)
- Borrower's Signature Over Printed Name + Date
- Co-Borrower's Signature Over Printed Name + Date

---

## Form B — Corporate Loan Application

### Header
| Field | Notes |
|---|---|
| Date Applied | |
| Type Of Loan | Dropdown: Business Loan / Auto Loan / REMortgage (default Business Loan) |
| Loan Desired | |
| Sales Agent | |

### Facts About the Company
| Left | Right |
|---|---|
| Name of Company | Acronym |
| Office Address | Landline Nos. |
| Nature of Business | Mobile Nos. |
| No. of Branches | Fax No. |
| E-mail Address | Date Established *(form typo: “Establised”)* |
| TIN | No. of Employees |
| | Website |

### Company Officers — 3 rows
| Name | Address | Position |

### Major Stockholders — 5 rows × 4 columns
| Name | Address | Position | Equity |

### Trade References
**Customers / Clients — 3 rows**
| Customer / Client | Address | Contact Person | Contact No. |

**Suppliers — 3 rows**
| Supplier | Address | Contact Person | Contact No. |

### Credit References — 3 rows
| Creditors / Banks | Type of Loan | Outstanding Balance | Monthly Payment | Contact No. |

### Bank Accounts — 3 rows
| Bank Name | Branch | Account No. | Account Type | Contact No. |

### Authorization + Requirements
- Consent / privacy paragraph
- Bank verification authorization paragraph
- **Bank Name and Account Number** (single line for ADB verification)
- Requirements checklist (printed on form, not fillable):
  1. SEC Registration, Articles of Incorporation and By-Laws (GIS)
  2. Company profile
  3. At least two (2) years of financial statement W/ ITR
  4. Six (6) months latest bank statement
  5. Two (2) valid ID of Official Representative
  6. TIN and CTC of the company and representative/s
  7. Board Resolution and Secretary Certificate to avail loan
  8. Business proof of billing
  9. Location Sketch
- Signature Over Printed Name

---

## What this means for the system

| Question | Answer |
|---|---|
| Can we extract all fields? | **Yes — done.** Both forms fully inventoried above. |
| Are these already in our on-screen form? | **Mostly yes** for data capture (`business_info` + personal fields). Some table row counts / labels may still need tightening against this inventory. |
| Do we print these exact layouts today? | **No.** Today we still print the **Seafarer** application form and fill SME values into shared slots. |
| Can we recreate printable forms accurately? | **Content/structure: yes.** Visual layout: we can match section order, tables, and labels closely in our document-template system; pixel-identical Excel/PDF clone is a design choice (use these PDFs as the visual master). |

---

## Recommended next step

Build **two dedicated printable templates**:
1. `application_form_sme_individual` — based on Form A  
2. `application_form_sme_corporate` — based on Form B  

Wire generation so SME Individual / Corporate apps use the matching template instead of the Seafarer one.

Preview images (for reference during build) live under `docs/_tmp_pdf_extract/` until cleaned up.
