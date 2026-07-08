export interface SignatureConfirmProps {
  docName: string;
  docType?: string;
  signed?: boolean;
  signedAt?: string;
  onSign?: () => void;
}
