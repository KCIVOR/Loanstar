/**
 * Dev-only fake data generators for the CI Report and Application Form
 * autofill overlay. Never imported outside dev-gated components — see
 * src/components/dev/AutofillOverlay.tsx.
 */
import type { BorrowerProfile, Dependent, Reference } from "@/lib/borrowers/types";
import type {
  BusinessBankAccount,
  BusinessOfficer,
  BusinessStockholder,
  CreditReference,
  TradeParty,
} from "@/lib/borrowers/business-info";
import type {
  FieldVisit,
  SmeReloanVerification,
} from "@/lib/cig/field-visit";
import type {
  PicDemeanorTag,
  PicPaymentPreference,
  PicVerification,
  ReferenceVerification,
  VerificationChecklist,
} from "@/lib/cig/verification";

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)] as T;
}

function num(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pastDate(yearsAgoMin: number, yearsAgoMax: number): string {
  const now = new Date();
  const yearsAgo = num(yearsAgoMin, yearsAgoMax);
  const d = new Date(now.getFullYear() - yearsAgo, num(0, 11), num(1, 28));
  return d.toISOString().slice(0, 10);
}

function futureDate(daysMin: number, daysMax: number): string {
  const d = new Date();
  d.setDate(d.getDate() + num(daysMin, daysMax));
  return d.toISOString().slice(0, 10);
}

function phone(): string {
  return `09${num(100000000, 999999999)}`;
}

const FIRST_NAMES = [
  "Juan",
  "Maria",
  "Jose",
  "Ana",
  "Pedro",
  "Rosa",
  "Carlos",
  "Elena",
  "Ramon",
  "Carmen",
  "Antonio",
  "Luz",
];
const LAST_NAMES = [
  "Dela Cruz",
  "Santos",
  "Reyes",
  "Garcia",
  "Mendoza",
  "Torres",
  "Flores",
  "Ramos",
  "Aquino",
  "Bautista",
];
const CITIES = [
  "Quezon City",
  "Manila",
  "Cebu City",
  "Davao City",
  "Cavite City",
  "Batangas City",
  "Iloilo City",
];
const PROVINCES = ["Metro Manila", "Cavite", "Laguna", "Cebu", "Davao del Sur", "Batangas"];
const STREETS = ["Rizal St.", "Mabini St.", "Bonifacio Ave.", "Aguinaldo St.", "Luna St."];
const BARANGAYS = ["Barangay 1", "San Isidro", "Poblacion", "Santo Niño", "Bagumbayan"];
const RELATIONSHIPS = ["Spouse", "Sibling", "Parent", "Friend", "Cousin", "Co-worker"];
const OCCUPATIONS = ["Teacher", "Nurse", "Driver", "Businessman", "OFW", "Government employee"];
const VESSELS = ["MV Pacific Star", "MV Ocean Voyager", "MV Star Explorer", "MV Blue Horizon"];
const RANKS = ["Able Seaman", "Ordinary Seaman", "Bosun", "Oiler", "Chief Cook", "Third Officer"];
const MANNING_AGENCIES = [
  "Pacific Ocean Manning Corp.",
  "Star Maritime Services Inc.",
  "Blue Horizon Crewing Agency",
];
const COMPANIES = [
  "Sunrise Trading Corp.",
  "Golden Harvest Enterprises",
  "Metro Builders Supply",
  "Prime Foods Distribution Inc.",
];
const BANKS = ["BDO", "BPI", "Metrobank", "Landbank", "PNB"] as const;

function fullName(): { firstName: string; lastName: string } {
  return { firstName: pick(FIRST_NAMES), lastName: pick(LAST_NAMES) };
}

function fakeAddress() {
  return {
    street: `${num(1, 999)} ${pick(STREETS)}`,
    barangay: pick(BARANGAYS),
    city: pick(CITIES),
    province: pick(PROVINCES),
    zipCode: String(num(1000, 9999)),
    country: "Philippines",
    lengthOfStay: `${num(1, 15)} years`,
    ownership: pick(["Owned", "Rented", "With Parents"]),
    mortgage: "",
  };
}

function fakeReferences(segment: "seafarer" | "sme"): Reference[] {
  return Array.from({ length: 2 }, () => {
    const { firstName, lastName } = fullName();
    return {
      name: `${firstName} ${lastName}`,
      relationship: pick(RELATIONSHIPS),
      address: `${pick(STREETS)}, ${pick(CITIES)}`,
      phone: phone(),
      occupation: segment === "seafarer" ? pick(OCCUPATIONS) : undefined,
    };
  });
}

function fakeDependents(): Dependent[] {
  return Array.from({ length: num(0, 2) }, () => {
    const { firstName, lastName } = fullName();
    return {
      name: `${firstName} ${lastName}`,
      relationship: pick(["Son", "Daughter", "Spouse"]),
      dateOfBirth: pastDate(1, 20),
      age: String(num(1, 20)),
      contactNo: phone(),
      occupation: pick(["Student", "", "Housewife"]),
    };
  });
}

/** Full BorrowerProfile fill for the Application Form (CSA intake / CIG edit / borrower's own). */
export function fakeBorrowerProfile(
  segment: "seafarer" | "sme",
  entityType: "individual" | "corporate" | null,
  base: BorrowerProfile,
): BorrowerProfile {
  const { firstName, lastName } = fullName();
  const isSme = segment === "sme";
  const isCorporate = isSme && entityType === "corporate";
  const isIndividualSme = isSme && entityType === "individual";

  const profile: BorrowerProfile = {
    ...base,
    firstName,
    middleName: pick(FIRST_NAMES),
    lastName,
    suffix: "",
    dateOfBirth: pastDate(22, 55),
    placeOfBirth: pick(CITIES),
    citizenship: "Filipino",
    civilStatus: pick(["Single", "Married", "Widowed"]),
    gender: pick(["male", "female"]),
    mobilePhone: phone(),
    landline: "",
    presentAddress: fakeAddress(),
    permanentAddress: fakeAddress(),
    dependents: fakeDependents(),
    references: fakeReferences(segment),
    profileData: {
      ...base.profileData,
      viber: phone(),
      teams: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@teams.example`,
      facebook: `${firstName}${lastName}FB`,
      education: pick(["College Graduate", "Vocational", "High School Graduate"]),
    },
  };

  if (!isSme) {
    profile.picWork = {
      rank: pick(RANKS),
      vessel: pick(VESSELS),
      contractDuration: `${num(6, 12)} months`,
      embarkationDate: pastDate(0, 1),
      disembarkationDate: futureDate(60, 300),
    };
    profile.manningAgency = {
      name: pick(MANNING_AGENCIES),
      address: `${pick(STREETS)}, Manila`,
      contactPerson: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
      phone: phone(),
      email: "crewing@example.com",
      crewingManager: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
      crewingManagerContact: phone(),
      yearsOfStay: `${num(1, 10)} years`,
      departureDate: futureDate(10, 90),
      previousAgency: "",
      previousSignOffDate: "",
      reasonForTransfer: "",
    };
    profile.financial = {
      ...profile.financial,
      monthlyIncomeUsd: num(800, 2500),
      monthlyIncomePhp: num(40000, 140000),
      householdExpensesPhp: num(15000, 40000),
      otherLoansPhp: num(0, 20000),
    };
    const { firstName: aFirst, lastName: aLast } = fullName();
    profile.allottee = {
      name: `${aFirst} ${aLast}`,
      relationship: pick(RELATIONSHIPS),
      address: fakeAddress(),
      phone: phone(),
      email: "",
      facebook: "",
      allotmentPercent: String(num(50, 100)),
      companyName: "",
      companyAddress: "",
      yearsStayed: "",
      companyPhone: "",
    };
  } else {
    const officer = (): BusinessOfficer => {
      const n = fullName();
      return { name: `${n.firstName} ${n.lastName}`, address: `${pick(CITIES)}`, position: pick(["President", "Treasurer", "Secretary"]) };
    };
    const stockholder = (): BusinessStockholder => {
      const n = fullName();
      return { name: `${n.firstName} ${n.lastName}`, address: pick(CITIES), position: pick(["President", "Director"]), equity: `${num(10, 100)}%` };
    };
    const trade = (): TradeParty => {
      const n = fullName();
      return { name: pick(COMPANIES), address: pick(CITIES), contactPerson: `${n.firstName} ${n.lastName}`, contactNo: phone() };
    };
    const credit = (): CreditReference => ({
      creditorBank: pick(BANKS),
      typeOfLoan: pick(["Business loan", "Auto loan", "Housing loan"]),
      monthlyPayment: String(num(5000, 30000)),
      outstandingBalance: String(num(50000, 500000)),
      contactNo: phone(),
    });
    const bankAccount = (): BusinessBankAccount => ({
      bankName: pick(BANKS),
      branch: pick(CITIES),
      accountNo: String(num(1000000000, 9999999999)),
      accountType: pick(["Savings", "Checking"]),
      contactNo: phone(),
    });

    profile.businessInfo = {
      ...profile.businessInfo,
      dateApplied: new Date().toISOString().slice(0, 10),
      salesAgent: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
      companyName: pick(COMPANIES),
      acronym: "",
      companyAddress: `${pick(STREETS)}, ${pick(CITIES)}`,
      officeAddress: `${pick(STREETS)}, ${pick(CITIES)}`,
      landlineNos: `02-${num(1000000, 9999999)}`,
      mobileNos: phone(),
      natureOfBusiness: pick(["Trading", "Manufacturing", "Retail", "Services"]),
      faxNo: "",
      numberOfBranches: String(num(1, 5)),
      dateEstablished: pastDate(3, 20),
      companyEmail: "info@example.com",
      numberOfEmployees: String(num(3, 50)),
      tin: `${num(100, 999)}-${num(100, 999)}-${num(100, 999)}`,
      website: "",
      position: pick(["Owner", "General Manager"]),
      yearsOfStay: `${num(1, 15)} years`,
      yearsOfOperation: `${num(2, 20)} years`,
      companyContactNumber: phone(),
      previousEmployer: "",
      previousCompanyAddress: "",
      previousYearsOfStay: "",
      previousContactNumber: "",
      businessGrossIncome: String(num(100000, 800000)),
      businessLessExpenses: String(num(30000, 300000)),
      businessNetIncome: String(num(70000, 500000)),
      ownMonthlyIncome: String(num(30000, 150000)),
      spouseGrossIncome: String(num(0, 100000)),
      spouseLessExpenses: String(num(0, 30000)),
      spouseNetIncome: String(num(0, 70000)),
      otherIncome: String(num(0, 20000)),
      sourceOfIncome: pick(["Rental", "Freelance", "Sideline business"]),
      totalNetIncome: String(num(80000, 400000)),
      bankAuthorizationAccount: String(num(1000000000, 9999999999)),
    };

    if (isIndividualSme) {
      const spouse = fullName();
      profile.businessInfo.spouse = {
        firstName: spouse.firstName,
        lastName: spouse.lastName,
        middleName: pick(FIRST_NAMES),
        dateOfBirth: pastDate(25, 55),
        presentAddress: `${pick(STREETS)}, ${pick(CITIES)}`,
        yearsOfStayPresent: `${num(1, 15)} years`,
        provincialAddress: pick(PROVINCES),
        yearsOfStayProvincial: `${num(1, 20)} years`,
        companyOrEmployerName: pick(COMPANIES),
        yearsOfStayCompany: `${num(1, 10)} years`,
        position: pick(["Employee", "Manager", "Self-employed"]),
        contactNumber: phone(),
        companyAddress: pick(CITIES),
      };
      profile.profileData = {
        ...profile.profileData,
        relativesLivingInProvince: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
        relativesLivingInProvinceAddress: pick(PROVINCES),
        relativesLivingInProvinceContact: phone(),
      };
    }

    if (isCorporate) {
      profile.businessInfo.companyOfficers = Array.from({ length: 3 }, officer);
      profile.businessInfo.majorStockholders = Array.from({ length: 3 }, stockholder);
      profile.businessInfo.tradeCustomers = Array.from({ length: 2 }, trade);
      profile.businessInfo.tradeSuppliers = Array.from({ length: 2 }, trade);
      profile.businessInfo.creditReferences = Array.from({ length: 2 }, credit);
      profile.businessInfo.bankAccounts = Array.from({ length: 2 }, bankAccount);
    }
  }

  return profile;
}

const CHECKLIST: VerificationChecklist = {
  validateBorrowerInfo: true,
  validatePicInfo: true,
  presidePicObligationSpill: true,
  verifiedCharacterReferences: true,
};

const PAYMENT_PREFERENCE: PicPaymentPreference = {
  method: pick(["BDO", "PBB", "EASTWEST", "UCPB", "BANK"] as const),
  bankSpecify: "",
  othersSpecify: "",
  remarks: "PIC prefers direct bank transfer.",
};

const DEMEANOR: PicDemeanorTag[] = ["cooperative"];

function fakePicVerification(): PicVerification {
  const n = fullName();
  return {
    name: `${n.firstName} ${n.lastName}`,
    birthday: pastDate(25, 60),
    presentAddress: {
      street: `${num(1, 999)} ${pick(STREETS)}`,
      barangay: pick(BARANGAYS),
      city: pick(CITIES),
      province: pick(PROVINCES),
      zipCode: String(num(1000, 9999)),
      ownership: pick(["owned", "rented"]),
      yearsOfStay: `${num(1, 15)} years`,
    },
    provincialAddress: {
      street: `${num(1, 999)} ${pick(STREETS)}`,
      barangay: pick(BARANGAYS),
      city: pick(CITIES),
      province: pick(PROVINCES),
      zipCode: String(num(1000, 9999)),
      ownership: "owned",
      yearsOfStay: `${num(5, 30)} years`,
    },
    contactNumber: phone(),
    relationToClient: pick(RELATIONSHIPS),
    otherNumber: phone(),
    sinceWhen: pastDate(1, 20),
    socialContact: `${n.firstName}${n.lastName}FB`,
    email: "",
    companyName: pick(COMPANIES),
    companyYearsOfStay: `${num(1, 10)} years`,
    companyPhone: phone(),
    siblings: [{ name: `${pick(FIRST_NAMES)} ${n.lastName}`, age: String(num(18, 50)), occupation: pick(OCCUPATIONS) }],
    willAvailLoanAware: true,
    otherFinancing: {
      hasOther: true,
      entries: Array.from({ length: num(1, 2) }, () => ({
        company: pick(BANKS),
        when: pastDate(1, 4),
        startEnd: `${pastDate(2, 4)} to ${pastDate(0, 1)}`,
        loanAmount: num(20000, 150000),
        monthly: num(2000, 12000),
      })),
    },
    housingLoan: {
      has: true,
      entries: Array.from({ length: num(1, 2) }, () => ({
        loanAmount: num(500000, 2000000),
        monthlyAmort: num(8000, 25000),
      })),
    },
    carLoan: {
      has: true,
      entries: Array.from({ length: num(1, 2) }, () => ({
        loanAmount: num(300000, 900000),
        monthlyAmort: num(6000, 18000),
      })),
    },
    otherVerificationCalls: { status: "none", company: "", wasLending: false, recalledLast3Months: false },
  };
}

function fakeReferenceVerifications(): ReferenceVerification[] {
  return Array.from({ length: 2 }, () => {
    const n = fullName();
    return {
      name: `${n.firstName} ${n.lastName}`,
      age: String(num(25, 60)),
      work: pick(OCCUPATIONS),
      relationToClient: pick(RELATIONSHIPS),
      howLongKnowClient: `${num(1, 15)} years`,
      contactNumber: phone(),
      otherContactNumber: "",
      facebookAccount: `${n.firstName}${n.lastName}FB`,
      firstTimeAsReference: true,
      otherVerificationCalls: { status: "no", company: "", recalledLast3Months: false },
      remarks: "Confirmed borrower's character and reliability.",
    };
  });
}

function fakeFieldVisit(): FieldVisit {
  const header = {
    dateRequested: pastDate(0, 0),
    dateVisited: pastDate(0, 0),
    requestedBy: "CIG",
    visitedBy: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
    clientName: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
    clientAddress: `${pick(STREETS)}, ${pick(CITIES)}`,
    companyName: pick(COMPANIES),
    companyAddress: `${pick(STREETS)}, ${pick(CITIES)}`,
  };
  return {
    header,
    residence: {
      availability: { date: pastDate(0, 0), time: "10:00 AM" },
      yearOfStay: num(1, 15),
      floorAreaSqm: num(40, 150),
      provincialResidence: pick(PROVINCES),
      provincialYearsOfStay: num(1, 20),
      ownedBy: pick(["Applicant", "Parents", "Spouse"]),
      previousAddress: "",
      previousYearsOfStay: 0,
      residenceType: "bungalow",
      landlordName: "",
      neighborhood: {},
      findingsReport: "Residence confirmed, well-maintained, family present during visit.",
      adverseFindingsClient: "None",
      adverseFindingsArea: "None",
      informants: [],
      expenses: {
        propertyMortgage: null,
        vehicles: { flag: false, howMany: 0, kindModel: "" },
        vehicleMortgage: null,
        householdCount: num(2, 6),
        maidCount: 0,
        maidSalary: 0,
        electricity: num(1000, 4000),
        water: num(300, 1000),
        internet: num(1000, 2000),
        food: num(6000, 15000),
        school: num(0, 10000),
      },
      otherRemarks: "",
    },
    business: null,
    recommendation: {
      evaluationSummary: "Applicant and residence verified as declared. No adverse findings.",
      creditRealizationRisk: "low",
      notes: "Recommended for approval based on field verification.",
      houseExpenses: null,
      businessIncome: null,
      recommendation: "for_approval",
      preparedBy: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
      preparedDate: pastDate(0, 0),
      reviewedBy: "",
      reviewedDate: "",
    },
  };
}

function fakeSmeReloanVerification(): SmeReloanVerification {
  return {
    header: {
      dateRequested: pastDate(0, 0),
      dateVisited: pastDate(0, 0),
      requestedBy: "CIG",
      visitedBy: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
      clientName: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
      clientAddress: `${pick(STREETS)}, ${pick(CITIES)}`,
      companyName: pick(COMPANIES),
      companyAddress: `${pick(STREETS)}, ${pick(CITIES)}`,
    },
    residence: {
      typeOfResidence: pick(["Owned", "Rented"]),
      stillResiding: true,
      owned: "Applicant",
      ownedYearsOfStay: num(1, 15),
      transferResidence: false,
      renting: false,
      monthlyRental: 0,
      rentingYearsOfStay: 0,
      transferNewAddress: "",
      householdExpenses: {
        electricity: num(1000, 3000),
        water: num(300, 800),
        internet: num(1000, 2000),
        subdivisionDues: num(0, 1000),
        school: num(0, 8000),
        helpersSalary: 0,
        monthlyAmortization: num(0, 10000),
      },
      otherRemarks: "",
    },
    business: {
      condition: "good",
      permits: "updated",
      stocksNo: num(50, 500),
      stocksEstimatedCost: num(50000, 300000),
      collectionProblem: "None reported.",
      operationProblem: "None reported.",
      businessExpenses: {
        employeeSalary: num(20000, 100000),
        water: num(500, 2000),
        electricity: num(3000, 15000),
        internet: num(1000, 3000),
        rental: num(0, 30000),
        operationalExpenses: num(5000, 20000),
        extraLine: 0,
      },
      otherRemarks: "",
    },
    baseOnFs: {
      totalSales: num(200000, 1000000),
      netIncomePercentage: num(10, 30),
      opexBusinessExpense: num(50000, 300000),
      netIncomePerMonth: num(30000, 200000),
    },
    risk: "low",
    recommendation: "Business and residence verified consistent with prior application. Recommended for approval.",
    verifiedBy: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
    notedBy: "",
  };
}

/** Full CI report fill: everything `assessVerificationCompleteness` checks for the given scope. */
export function fakeVerificationPatch(segment: "seafarer" | "sme", isReloan: boolean) {
  const base = {
    fieldCompletenessOk: true,
    fieldCompletenessNotes: "All fields verified complete and consistent.",
    biIdentityConfirmed: true,
    biPurposeConfirmed: true,
    biDetailsConfirmed: true,
    biNotes: "Identity, purpose, and details confirmed via phone interview.",
    finding: "positive" as const,
    findingNotes: "No derogatory findings. Recommended to proceed.",
  };

  if (segment === "sme") {
    return {
      ...base,
      ...(isReloan
        ? { smeReloanVerification: fakeSmeReloanVerification() }
        : { fieldVisit: fakeFieldVisit() }),
    };
  }

  return {
    ...base,
    picAllotmentAwareness: "Aware and supportive of the loan application.",
    picPaymentReliability: "Reliable, has consistently supported past obligations.",
    picInterviewNotes: "PIC interviewed by phone, confirmed relationship and details.",
    cmDepartureDate: futureDate(10, 90),
    cmSalary: num(800, 2500),
    cmPosition: pick(RANKS),
    cmContractStatus: pick(["Active", "Signed", "Pending deployment"]),
    cmFitToWork: true,
    cmNotes: "Contract verified with manning agency, fit to work confirmed.",
    cmManagerName: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
    cmManagerPosition: pick(["Crewing Officer", "Senior Crewing Manager", "Fleet Personnel Officer"]),
    cmManagerContact: phone(),
    cmManningAgencyName: pick(MANNING_AGENCIES),
    cmJoiningPort: pick(["Manila", "Batangas", "Cebu", "Singapore", "Hong Kong"]),
    characterReferencesNotes: "Both references confirmed borrower's good character.",
    charRefOtherLenders: false,
    picVerification: fakePicVerification(),
    referenceVerifications: fakeReferenceVerifications(),
    verificationChecklist: CHECKLIST,
    picPaymentPreference: PAYMENT_PREFERENCE,
    picDemeanor: DEMEANOR,
    picRating: num(4, 5),
    picRatingReason: "Cooperative, forthcoming, and consistent with application details.",
    cifVerifiedDate: pastDate(0, 0),
  };
}
