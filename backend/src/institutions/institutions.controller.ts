import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { InstitutionsService } from './institutions.service';
import { AcademicTermDto, AssignDepartmentDto, AssignStudentSubjectDto, CourseDto, DepartmentDto } from './dto/institution.dto';

@Controller('institutions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class InstitutionsController {
  constructor(private service: InstitutionsService) {}

  @Get('overview') getOverview() { return this.service.getOverview(); }
  @Get('departments') getDepartments() { return this.service.findDepartments(); }
  @Post('departments') createDepartment(@Body() dto: DepartmentDto) { return this.service.createDepartment(dto); }
  @Patch('departments/:id') updateDepartment(@Param('id') id: string, @Body() dto: DepartmentDto) { return this.service.updateDepartment(id, dto); }
  @Delete('departments/:id') deleteDepartment(@Param('id') id: string) { return this.service.deleteDepartment(id); }

  @Get('courses') getCourses() { return this.service.findCourses(); }
  @Post('courses') createCourse(@Body() dto: CourseDto) { return this.service.createCourse(dto); }
  @Patch('courses/:id') updateCourse(@Param('id') id: string, @Body() dto: CourseDto) { return this.service.updateCourse(id, dto); }
  @Delete('courses/:id') deleteCourse(@Param('id') id: string) { return this.service.deleteCourse(id); }

  @Get('terms') getTerms() { return this.service.findTerms(); }
  @Post('terms') createTerm(@Body() dto: AcademicTermDto) { return this.service.createTerm(dto); }
  @Patch('terms/:id') updateTerm(@Param('id') id: string, @Body() dto: AcademicTermDto) { return this.service.updateTerm(id, dto); }
  @Delete('terms/:id') deleteTerm(@Param('id') id: string) { return this.service.deleteTerm(id); }

  @Get('users') getUsers() { return this.service.getUsers(); }
  @Patch('users/:id/department') assignUserDepartment(@Param('id') id: string, @Body() dto: AssignDepartmentDto) { return this.service.assignUserDepartment(id, dto); }
  @Get('student-assignments') getStudentAssignments() { return this.service.getStudentAssignments(); }
  @Post('users/:id/subjects') assignStudentSubject(@Param('id') id: string, @Body() dto: AssignStudentSubjectDto) { return this.service.assignStudentSubject(id, dto); }

}
