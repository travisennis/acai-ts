// Non-exported interface
interface InternalDetails {
  id: number;
  status: string;
}

// Exported interface
export interface TestInterface {
  name: string;
  details: InternalDetails;
  process(): void;
}
