import * as XLSX from "xlsx"

// Create a separate interface for raw Excel data
export interface RawStudentInput {
  applicationId: string;
  name: string;
  email: string;
  phone: string;
  department: string; 
}

export function parseStudentsExcel(buffer: Buffer): RawStudentInput[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const jsonData = XLSX.utils.sheet_to_json<any>(sheet, { defval: "" });

  return jsonData.map((row) => ({
    applicationId: String(row.applicationId).trim(),
    name: String(row.name).trim(),
    email: String(row.email).trim(),
    phone: String(row.phone).trim(),
    department: String(row.department).trim(),
  }));
}