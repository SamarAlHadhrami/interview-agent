import candidatesJson from "@/data/candidates.json";
import curriculumJson from "@/data/curriculum.json";

export type Mission = {
  day: number;
  title: string;
  passed?: boolean;
  attempts?: number;
  skipped?: boolean;
};

export type CandidateMember = {
  id: string;
  name: string;
  jobRole: string;
  yearsExperience: number;
  education: string;
  status: string;
};

export type Candidate = {
  member: CandidateMember;
  missions: Mission[];
  signals: {
    commitDays: number;
    missionsCompleted: number;
    missionsFirstTry: number;
  };
};

export type CandidatesData = {
  candidates: Candidate[];
};

export type CurriculumDay = {
  day: number;
  title: string;
  type: string;
  tools: string[];
  objectives: string[];
};

export type CurriculumModule = {
  n: number;
  title: string;
  days: number[];
};

export type CurriculumData = {
  cohort: string;
  modules: CurriculumModule[];
  days: CurriculumDay[];
};

export const candidates = candidatesJson as CandidatesData;
export const curriculum = curriculumJson as CurriculumData;
