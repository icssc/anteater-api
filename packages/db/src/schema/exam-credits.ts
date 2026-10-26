export type CoursesGrantedTree =
  | {
      AND: (CoursesGrantedTree | string)[];
    }
  | {
      OR: (CoursesGrantedTree | string)[];
    };
