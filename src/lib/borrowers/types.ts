export type Address = {
  street?: string;
  barangay?: string;
  city?: string;
  province?: string;
  zipCode?: string;
  country?: string;
};

export type ManningAgency = {
  name?: string;
  address?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
};

export type FinancialInfo = {
  monthlyIncome?: number;
  otherIncome?: number;
  bankName?: string;
  accountNumber?: string;
  accountType?: string;
};

export type AllotteeInfo = {
  name?: string;
  relationship?: string;
  address?: Address;
  phone?: string;
};

export type PicWorkInfo = {
  rank?: string;
  vessel?: string;
  contractDuration?: string;
  embarkationDate?: string;
  disembarkationDate?: string;
};

export type Dependent = {
  name?: string;
  relationship?: string;
  dateOfBirth?: string;
};

export type Reference = {
  name?: string;
  relationship?: string;
  address?: string;
  phone?: string;
};

export type BorrowerProfile = {
  id: string;
  userId: string | null;
  borrowerNo: string;
  email: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
  dateOfBirth: string | null;
  placeOfBirth: string | null;
  citizenship: string | null;
  civilStatus: string | null;
  gender: string | null;
  mobilePhone: string | null;
  landline: string | null;
  presentAddress: Address;
  permanentAddress: Address;
  manningAgency: ManningAgency;
  financial: FinancialInfo;
  allottee: AllotteeInfo;
  picWork: PicWorkInfo;
  dependents: Dependent[];
  references: Reference[];
  profileData: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type BorrowerRow = {
  id: string;
  user_id: string | null;
  borrower_no: string;
  email: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  date_of_birth: string | null;
  place_of_birth: string | null;
  citizenship: string | null;
  civil_status: string | null;
  gender: string | null;
  mobile_phone: string | null;
  landline: string | null;
  present_address: Address;
  permanent_address: Address;
  manning_agency: ManningAgency;
  financial: FinancialInfo;
  allottee: AllotteeInfo;
  pic_work: PicWorkInfo;
  dependents: Dependent[];
  references_data: Reference[];
  profile_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export function mapBorrowerRow(row: BorrowerRow): BorrowerProfile {
  return {
    id: row.id,
    userId: row.user_id,
    borrowerNo: row.borrower_no,
    email: row.email,
    firstName: row.first_name,
    middleName: row.middle_name,
    lastName: row.last_name,
    suffix: row.suffix,
    dateOfBirth: row.date_of_birth,
    placeOfBirth: row.place_of_birth,
    citizenship: row.citizenship,
    civilStatus: row.civil_status,
    gender: row.gender,
    mobilePhone: row.mobile_phone,
    landline: row.landline,
    presentAddress: row.present_address ?? {},
    permanentAddress: row.permanent_address ?? {},
    manningAgency: row.manning_agency ?? {},
    financial: row.financial ?? {},
    allottee: row.allottee ?? {},
    picWork: row.pic_work ?? {},
    dependents: row.dependents ?? [],
    references: row.references_data ?? [],
    profileData: row.profile_data ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function borrowerProfileToRow(
  profile: Partial<BorrowerProfile> & { email?: string },
): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (profile.email !== undefined) row.email = profile.email;
  if (profile.firstName !== undefined) row.first_name = profile.firstName;
  if (profile.middleName !== undefined) row.middle_name = profile.middleName;
  if (profile.lastName !== undefined) row.last_name = profile.lastName;
  if (profile.suffix !== undefined) row.suffix = profile.suffix;
  if (profile.dateOfBirth !== undefined) row.date_of_birth = profile.dateOfBirth;
  if (profile.placeOfBirth !== undefined) row.place_of_birth = profile.placeOfBirth;
  if (profile.citizenship !== undefined) row.citizenship = profile.citizenship;
  if (profile.civilStatus !== undefined) row.civil_status = profile.civilStatus;
  if (profile.gender !== undefined) row.gender = profile.gender;
  if (profile.mobilePhone !== undefined) row.mobile_phone = profile.mobilePhone;
  if (profile.landline !== undefined) row.landline = profile.landline;
  if (profile.presentAddress !== undefined) row.present_address = profile.presentAddress;
  if (profile.permanentAddress !== undefined) row.permanent_address = profile.permanentAddress;
  if (profile.manningAgency !== undefined) row.manning_agency = profile.manningAgency;
  if (profile.financial !== undefined) row.financial = profile.financial;
  if (profile.allottee !== undefined) row.allottee = profile.allottee;
  if (profile.picWork !== undefined) row.pic_work = profile.picWork;
  if (profile.dependents !== undefined) row.dependents = profile.dependents;
  if (profile.references !== undefined) row.references_data = profile.references;
  if (profile.profileData !== undefined) row.profile_data = profile.profileData;
  return row;
}
