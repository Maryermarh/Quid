import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { HunterModule } from './hunter/hunter.module';
import { MissionsModule } from './missions/missions.module';
import { PrismaModule } from './prisma/prisma.module';
import { UploadModule } from './upload/upload.module';
import { IndexerModule } from './indexer/indexer.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
    }),
    ScheduleModule.forRoot(),
    // Issue #348: global rate limiting – 100 requests per 60 s per IP.
    // Auth endpoints apply a tighter override via @Throttle() decorator.
    ThrottlerModule.forRoot([
      {
        name: 'global',
        ttl: 60_000, // 60 seconds (ms)
        limit: 100,
      },
    ]),
    PrismaModule,
    AuthModule,
    // Issue #331: exposes GET /users/me and PATCH /users/me/role so the
    // onboarding role choice is stored against the Prisma user.
    UsersModule,
    MissionsModule,
    // Issue #327: hunter-facing submissions list (GET /hunter/my-submissions).
    HunterModule,
    UploadModule,
    IndexerModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Bind ThrottlerGuard globally so every route is rate-limited by default.
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
