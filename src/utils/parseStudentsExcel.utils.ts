import { Department } from "@prisma/client";
import * as XLSX from "xlsx";
export interface RawStudentInput {
  applicationId: string;
  name: string;
  email: string;
  phone: string;
  department: Department;
}
export function parseStudentsExcel(buffer: Buffer): RawStudentInput[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const jsonData = XLSX.utils.sheet_to_json<any>(sheet, { defval: "" });
  console.log(":page_facing_up: Raw Excel JSON data:", jsonData);
  const parsedData = jsonData.map((row) => {
    const cleanRow: any = {};
    Object.keys(row).forEach((key) => {
      cleanRow[key.trim()] = row[key];
    });
    return {
      applicationId: String(cleanRow.applicationId).trim(),
      name: String(cleanRow.name).trim(),
      email: String(cleanRow.email).trim(),
      phone: String(cleanRow.phone).trim(),
      department: String(cleanRow.department).trim().toUpperCase() as Department,
    };
  });
  return parsedData;
}