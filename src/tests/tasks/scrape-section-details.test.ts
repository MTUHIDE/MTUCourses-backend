import {ESemester} from '@mtucourses/scraper';
import {LocationType, Semester} from '@prisma/client';
import test from 'ava';
import {FakeFetcherService} from '../fixtures/fetcher-fake';
import {getTestTask} from '../fixtures/get-test-task';
import {termToDate} from '~/lib/dates';
import {ScrapeSectionDetailsTask} from '~/tasks/scrape-section-details';

const getTermFromFake = () => {
	const fake = new FakeFetcherService();
	return termToDate({
		year: fake.courses[0].year,
		semester: fake.courses[0].semester
	}).toISOString();
};

test.serial('scrapes successfully', async t => {
	const {task} = await getTestTask(ScrapeSectionDetailsTask, {
		seedBuildings: true,
		seedInstructors: true,
		seedCourses: true,
		seedSections: true,
	});

	await task.handler({
		terms: [getTermFromFake()],
	});

	t.pass();
});

test.serial('updates location to online', async t => {
	const {prisma, task, fetcherFake} = await getTestTask(ScrapeSectionDetailsTask, {
		seedBuildings: true,
		seedInstructors: true,
		seedCourses: true,
		seedSections: true,
	});

	fetcherFake.courses = fetcherFake.courses.map(c => ({
		...c,
		sectionDetails: c.sectionDetails.map(s => ({
			...s,
			extSectionDetails: {
				...s.extSectionDetails,
				location: 'Online Instruction',
			}
		}))
	}));

	await task.handler({
		terms: [getTermFromFake()],
	});

	const section = await prisma.section.findFirstOrThrow();

	t.is(section.locationType, LocationType.ONLINE);
	t.is(section.buildingName, null),
	t.is(section.room, null);
});

test.serial('updates room', async t => {
	const {prisma, task, fetcherFake} = await getTestTask(ScrapeSectionDetailsTask, {
		seedBuildings: true,
		seedInstructors: true,
		seedCourses: true,
		seedSections: true,
	});

	const [course] = fetcherFake.courses;

	await task.handler({
		terms: [getTermFromFake()],
	});

	const section = await prisma.section.findFirstOrThrow();
	t.is(section.buildingName, 'Fisher Hall');
	t.is(section.room, course.extSections[0].location?.split('Fisher Hall ')[1] ?? '');

	// Update room
	fetcherFake.courses = fetcherFake.courses.map(c => ({
		...c,
		sectionDetails: c.sectionDetails.map(s => ({
			...s,
			extSectionDetails: {
				...s.extSectionDetails,
				location: 'Fisher Hall 123',
			}
		}))
	}));

	await task.handler({
		terms: [getTermFromFake()],
	});

	const updatedSection = await prisma.section.findFirstOrThrow();
	t.is(updatedSection.buildingName, 'Fisher Hall');
	t.is(updatedSection.room, '123');
});

test.serial('updates instructor', async t => {
	const {prisma, task, fetcherFake} = await getTestTask(ScrapeSectionDetailsTask, {
		seedBuildings: true,
		seedInstructors: true,
		seedCourses: true,
		seedSections: true,
	});

	const [course] = fetcherFake.courses;

	await task.handler({
		terms: [getTermFromFake()],
	});

	const section = await prisma.section.findFirstOrThrow({
		include: {
			instructors: true
		}
	});
	t.is(section.instructors.length, course.sectionDetails[0].extSectionDetails.instructors.length);
	t.like(section.instructors[0], {
		fullName: fetcherFake.instructors[0].name,
	});

	// Update instructor
	fetcherFake.courses = fetcherFake.courses.map(c => ({
		...c,
		sectionDetails: c.sectionDetails.map(s => ({
			...s,
			extSectionDetails: {
				...s.extSectionDetails,
				instructors: ['Leo Ureel'],
			}
		}))
	}));

	await task.handler({
		terms: [getTermFromFake()],
	});

	const updatedSection = await prisma.section.findFirstOrThrow({
		include: {
			instructors: true
		}
	});
	t.is(updatedSection.instructors.length, course.sectionDetails[0].extSectionDetails.instructors.length);
	t.like(updatedSection.instructors[0], {
		fullName: 'Leo Ureel',
	});

	// Created a new instructor
	const instructor = await prisma.instructor.findFirst({
		where: {
			fullName: 'Leo Ureel'
		}
	});
	t.truthy(instructor);
});

test.serial('disconnects removed instructor', async t => {
	const {prisma, task, fetcherFake} = await getTestTask(ScrapeSectionDetailsTask, {
		seedBuildings: true,
		seedInstructors: true,
		seedCourses: true,
		seedSections: true,
	});

	await task.handler({
		terms: [getTermFromFake()],
	});

	// Remove instructor
	fetcherFake.courses = fetcherFake.courses.map(c => ({
		...c,
		sectionDetails: c.sectionDetails.map(s => ({
			...s,
			extSectionDetails: {
				...s.extSectionDetails,
				instructors: [],
			}
		}))
	}));

	await task.handler({
		terms: [getTermFromFake()],
	});

	const updatedSection = await prisma.section.findFirstOrThrow({
		include: {
			instructors: true
		}
	});
	t.is(updatedSection.instructors.length, 0);
});

test.serial('updates course description', async t => {
	const {prisma, task, fetcherFake} = await getTestTask(ScrapeSectionDetailsTask, {
		seedBuildings: true,
		seedInstructors: true,
		seedCourses: true,
		seedSections: true,
	});

	const [extCourse] = fetcherFake.courses;

	await task.handler({
		terms: [getTermFromFake()],
	});

	const course = await prisma.course.findFirstOrThrow();
	t.is(course.description, extCourse.sectionDetails[0].extSectionDetails.description);

	// Update description
	fetcherFake.courses = fetcherFake.courses.map(c => ({
		...c,
		sectionDetails: c.sectionDetails.map(s => ({
			...s,
			extSectionDetails: {
				...s.extSectionDetails,
				description: 'Updated description'
			}
		}))
	}));

	await task.handler({
		terms: [getTermFromFake()],
	});

	const updatedCourse = await prisma.course.findFirstOrThrow();
	t.is(updatedCourse.description, 'Updated description');
});

test.serial('updates course offered semesters', async t => {
	const {prisma, task, fetcherFake} = await getTestTask(ScrapeSectionDetailsTask, {
		seedBuildings: true,
		seedInstructors: true,
		seedCourses: true,
		seedSections: true,
	});

	await task.handler({
		terms: [getTermFromFake()],
	});

	// Update offered semesters
	fetcherFake.courses = fetcherFake.courses.map(c => ({
		...c,
		sectionDetails: c.sectionDetails.map(s => ({
			...s,
			extSectionDetails: {
				...s.extSectionDetails,
				semestersOffered: [ESemester.fall, ESemester.spring, ESemester.summer],
			}
		}))
	}));

	await task.handler({
		terms: [getTermFromFake()],
	});

	const updatedCourse = await prisma.course.findFirstOrThrow();
	t.deepEqual(updatedCourse.offered, [
		Semester.FALL,
		Semester.SPRING,
		Semester.SUMMER,
	]);
});

test.serial('updates course prereqs', async t => {
	const {prisma, task, fetcherFake} = await getTestTask(ScrapeSectionDetailsTask, {
		seedBuildings: true,
		seedInstructors: true,
		seedCourses: true,
		seedSections: true,
	});

	await task.handler({
		terms: [getTermFromFake()],
	});

	const course = await prisma.course.findFirstOrThrow();
	t.is(course.prereqs, null);

	// Update prereqs
	fetcherFake.courses = fetcherFake.courses.map(c => ({
		...c,
		sectionDetails: c.sectionDetails.map(s => ({
			...s,
			extSectionDetails: {
				...s.extSectionDetails,
				prereqs: 'Updated prereqs'
			}
		}))
	}));

	await task.handler({
		terms: [getTermFromFake()],
	});

	const updatedCourse = await prisma.course.findFirstOrThrow();
	t.is(updatedCourse.prereqs, 'Updated prereqs');
});

test.serial('doesn\'t update if unchanged', async t => {
	const {prisma, task} = await getTestTask(ScrapeSectionDetailsTask, {
		seedBuildings: true,
		seedInstructors: true,
		seedCourses: true,
		seedSections: true,
	});

	await task.handler({
		terms: [getTermFromFake()],
	});

	const section = await prisma.section.findFirstOrThrow();

	await task.handler({
		terms: [getTermFromFake()],
	});

	const updatedSection = await prisma.section.findFirstOrThrow();

	t.is(section.updatedAt.getTime(), updatedSection.updatedAt.getTime());
});
