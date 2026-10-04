import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';
export const records = sqliteTable('records', {id: integer('id').primaryKey({autoIncrement:true}),kind:text('kind').notNull(),payload:text('payload').notNull(),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),deleted:integer('deleted').notNull().default(0)});
export const audit = sqliteTable('audit', {id:integer('id').primaryKey({autoIncrement:true}),recordId:integer('record_id').notNull(),action:text('action').notNull(),before:text('before'),after:text('after'),at:text('at').notNull()});
