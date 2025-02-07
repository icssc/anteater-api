import { z } from "@hono/zod-openapi";

export const enrollmentChangesQuerySchema = z.object({
  sections: z
    .string({ required_error: "The 'sections' query parameter is required." })
    .nonempty("The 'sections' query parameter cannot be empty."),
});

/**
 * Schema definitions for the enrollmentChanges response.
 *
 * The expected response shape is:
 * {
 *   "courses": [
 *     {
 *       "deptCode": "BIO SCI",
 *       "courseTitle": "DNA TO ORGANISMS",
 *       "courseNumber": "93",
 *       "sections": [
 *         {
 *           "sectionCode": "12345",
 *           "maxCapacity": "75",
 *           "status": {
 *             "from": "Waitl",
 *             "to": "OPEN"
 *           },
 *           "numCurrentlyEnrolled": {
 *             "totalEnrolled": "72",
 *             "sectionEnrolled": ""
 *           },
 *           "numRequested": "85",
 *           "numOnWaitlist": "0",
 *           "numWaitlistCap": "10"
 *         }
 *       ]
 *     }
 *   ],
 *   "updatedAt": "2024-12-07T12:00:00Z"
 * }
 */

const enrollmentChangeStatusSchema = z.object({
  from: z.string(), 
  to: z.string(),
});

const numCurrentlyEnrolledSchema = z.object({
  totalEnrolled: z.string(),  
  sectionEnrolled: z.string(), 
});

const enrollmentChangeSectionSchema = z.object({
  sectionCode: z.string(), 
  maxCapacity: z.string(),  
  status: enrollmentChangeStatusSchema,
  numCurrentlyEnrolled: numCurrentlyEnrolledSchema,
  numRequested: z.string(),  
  numOnWaitlist: z.string(),  
  numWaitlistCap: z.string(),
});

const enrollmentChangeCourseSchema = z.object({
  deptCode: z.string(),       
  courseTitle: z.string(),    
  courseNumber: z.string(), 
  sections: z.array(enrollmentChangeSectionSchema),
});

export const enrollmentChangesSchema = z.object({
  courses: z.array(enrollmentChangeCourseSchema),
  updatedAt: z.string(), 
});
