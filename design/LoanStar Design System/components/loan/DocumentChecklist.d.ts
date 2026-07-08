export interface ChecklistDocument {
  name: string;
  filename?: string;
  status: "pending" | "uploaded" | "confirmed";
}

export interface DocumentChecklistProps {
  documents: ChecklistDocument[];
  /** Agent view: render a single Complete/Incomplete pill instead of full rows. */
  flagsOnly?: boolean;
  onUpload?: (doc: ChecklistDocument) => void;
}
