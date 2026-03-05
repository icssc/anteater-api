select * from specialization limit 100;

select ARRAY_AGG(id) from specialization;
select * from specialization;

select * from degree;
select * from major;
select * from major_spec;

select COUNT(*) from specialization;

select m.id as major_id, s.id as spec_id, m.name as major, s.name as spec, degree_id
from major as m
inner join specialization as s
on m.id = s.major_id
Order By degree_id, major;

select count(*) from specialization 
where major_id in (
  'MFA-231',
  'MFA-579',
  'BA-579',
  'BMUS-582',
  'BA-174',
  'BS-276',
  'BS-284',
  'BS-294',
  'BS-201',
  'BA-163',
  'PHD-0B0',
  'MAT-25B',
  'MS-07T'
);

select * from specialization 
where major_id not in (
  'MFA-231',
  'MFA-579',
  'BA-579',
  'BMUS-582',
  'BA-174',
  'BS-276',
  'BS-284',
  'BS-294',
  'BS-201',
  'BA-163',
  'PHD-0B0',
  'MAT-25B',
  'MS-07T'
);

select DISTINCT id, name, specialization_required from major
where id not in (
  'MFA-231',
  'MFA-579',
  'BA-579',
  'BMUS-582',
  'BA-174',
  'BS-276',
  'BS-284',
  'BS-294',
  'BS-201',
  'BA-163',
  'PHD-0B0',
  'MAT-25B',
  'MS-07T'
) and specialization_required = true;


select distinct major from 
(
  select m.id as major_id, m.degree_id as deg, s.major_id as spec_id, m.name as major, m.specialization_required as specialization_required
  from major as m
  inner join specialization as s
  on m.id = s.major_id
  order by deg, major
)
where specialization_required = false;

select * from minor where id = '120';

delete from major_requirement;
delete from specialization;
delete from major;

select * from specialization
where major_id = 'BS-0K6';

select * from minor;


select major.id, major.name, mr.requirements, ms.spec_id, ms.requirement_id
from major
left join major_spec_pair_to_requirement as ms
on major.id = ms.major_id
left join major_requirement as mr
on ms.requirement_id = mr.id
where major.id = 'BS-201' and ms.spec_id is NULL;

select * from instructor_to_websoc_instructor;
select * from degree;
select * from school_requirement;
select * from major_spec_pair_to_requirement;
select * from major_requirement;
select * from major_spec_pair_to_requirement where spec_id = 'BS-201A';
select * from college_requirement;
select * from specialization;
select * from major
where specialization_required is null;

select count(*) from major where specialization_required = TRUE;
select * from major where specialization_required = TRUE;

select DISTINCT m.name from major as m
inner join specialization as s on m.id = s.major_id
where m.specialization_required = FALSE;

select * from specialization;
select * from major;


select r.id, msr.id, m.name, s.name,r.requirements, m.specialization_required from major_spec_pair_to_requirement as msr
full outer join major_requirement as r
on msr.requirement_id = r.id
full outer join major as m
on msr.major_id = m.id
full outer join specialization as s
on msr.spec_id = s.id;


delete from websoc_section_meeting;
delete from websoc_section_enrollment;
delete from websoc_section_grade;
delete from websoc_section;
delete from larc_section;
delete from websoc_course;

select * from course;
select * from websoc_course;
select * from calendar_term;
select * from websoc_school;
select * from websoc_section limit 10;
select * from websoc_course limit 10;
select * from websoc_section_meeting_to_location limit 10;
select * from study_room limit 10;

alter table major_spec_pair_to_requirement
add constraint unique_major_requirement_id_constraint UNIQUE(requirement_Id);

alter table major_requirement
add constraint unique_major_requirement Unique(requirements);

create table test_table(
  major_id varchar(50),
  spec_id varchar(50),
  id varchar(50) generated always as(
    case when spec_id is not null then
      "major_id" || '+' || "spec_id"
    else
      "major_id"
    end
  ) stored
);

insert into test_table (major_id, spec_id)
values  ('BS-201', '201A'),
        ('BS-0K6', ''),
        ('BA-163', null);

select * from test_table;

select * from calendar_term;