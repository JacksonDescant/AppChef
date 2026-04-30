export interface Job {
  id: string
  company: string
  title: string
  location: string
  startDate: string
  endDate: string
  current: boolean
  description: string
  bullets: string
}

export interface EducationEntry {
  id: string
  institution: string
  degree: string
  field: string
  location: string
  startDate: string
  endDate: string
  current: boolean
  gpa: string
  minor: string
  description: string
}

export interface Project {
  id: string
  name: string
  description: string
  technologies: string
  url: string
  startDate: string
  endDate: string
  bullets: string
}

export interface Skill {
  id: string
  name: string
  category: string
  level: string
}

export interface TargetJob {
  id: string
  title: string
  industry: string
  locationType: string  // 'remote' | 'hybrid' | 'onsite'
  location: string
  minSalary: number | null
  maxSalary: number | null
  notes: string
}

export interface Application {
  id: string
  company: string
  role: string
  url: string
  appliedAt: string   // ISO date string
  status: ApplicationStatus
  notes: string
  createdAt: string
}

export type ApplicationStatus =
  | 'applied'
  | 'screening'
  | 'technical_assessment'
  | 'interview'
  | 'round1'
  | 'round2'
  | 'round3'
  | 'offer'
  | 'rejected'

export interface Profile {
  name: string
  email: string
  phone: string
  location: string
  website: string
  linkedin: string
  github: string
  summary: string
}

export interface SavedResume {
  id: string
  createdAt: string
  jobDescription: string
  content: string
}

export interface AppSettings {
  llamaEndpoint: string
  modelName: string
  temperature: number
  maxTokens: number
}
