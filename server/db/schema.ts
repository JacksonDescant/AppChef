import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

export const jobs = sqliteTable('jobs', {
  id:          text('id').primaryKey(),
  company:     text('company').notNull(),
  title:       text('title').notNull(),
  // Market-standard alias for a non-standard internal title; rendered as
  // "Display Title (Internal Title)" so the resume stays background-check honest.
  displayTitle: text('display_title').notNull().default(''),
  location:    text('location').notNull().default(''),
  startDate:   text('start_date').notNull().default(''),
  endDate:     text('end_date').notNull().default(''),
  current:     integer('current', { mode: 'boolean' }).notNull().default(false),
  description: text('description').notNull().default(''),
  bullets:     text('bullets').notNull().default(''),
})

export const education = sqliteTable('education', {
  id:          text('id').primaryKey(),
  institution: text('institution').notNull(),
  degree:      text('degree').notNull(),
  field:       text('field').notNull().default(''),
  location:    text('location').notNull().default(''),
  startDate:   text('start_date').notNull().default(''),
  endDate:     text('end_date').notNull().default(''),
  current:     integer('current', { mode: 'boolean' }).notNull().default(false),
  gpa:         text('gpa').notNull().default(''),
  minor:       text('minor').notNull().default(''),
  description: text('description').notNull().default(''),
})

export const projects = sqliteTable('projects', {
  id:           text('id').primaryKey(),
  name:         text('name').notNull(),
  description:  text('description').notNull().default(''),
  technologies: text('technologies').notNull().default(''),
  url:          text('url').notNull().default(''),
  startDate:    text('start_date').notNull().default(''),
  endDate:      text('end_date').notNull().default(''),
  bullets:      text('bullets').notNull().default(''),
})

export const skills = sqliteTable('skills', {
  id:       text('id').primaryKey(),
  name:     text('name').notNull(),
  category: text('category').notNull().default(''),
  level:    text('level').notNull().default(''),
})

export const targetJobs = sqliteTable('target_jobs', {
  id:           text('id').primaryKey(),
  title:        text('title').notNull(),
  industry:     text('industry').notNull().default(''),
  locationType: text('location_type').notNull().default(''), // remote | hybrid | onsite
  location:     text('location').notNull().default(''),
  minSalary:    integer('min_salary'),
  maxSalary:    integer('max_salary'),
  notes:        text('notes').notNull().default(''),
})

export const applications = sqliteTable('applications', {
  id:        text('id').primaryKey(),
  company:   text('company').notNull(),
  role:      text('role').notNull(),
  url:       text('url').notNull().default(''),
  appliedAt: text('applied_at').notNull(),
  status:    text('status').notNull().default('applied'), // applied | screening | interview | offer | rejected
  notes:     text('notes').notNull().default(''),
  createdAt: text('created_at').notNull(),
})

export const savedResumes = sqliteTable('saved_resumes', {
  id:             text('id').primaryKey(),
  createdAt:      text('created_at').notNull(),
  jobDescription: text('job_description').notNull().default(''),
  content:        text('content').notNull().default(''),
})

export const profile = sqliteTable('profile', {
  id:       integer('id').primaryKey().default(1),
  name:     text('name').notNull().default(''),
  email:    text('email').notNull().default(''),
  phone:    text('phone').notNull().default(''),
  location: text('location').notNull().default(''),
  website:  text('website').notNull().default(''),
  linkedin: text('linkedin').notNull().default(''),
  github:   text('github').notNull().default(''),
  summary:  text('summary').notNull().default(''),
})

export const settings = sqliteTable('settings', {
  id:            integer('id').primaryKey().default(1),
  llamaEndpoint: text('llama_endpoint').notNull().default('http://localhost:8080'),
  modelName:     text('model_name').notNull().default(''),
  temperature:   real('temperature').notNull().default(0.7),
  maxTokens:     integer('max_tokens').notNull().default(32000),
})
