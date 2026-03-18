import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import { getDatabase } from '../db/index.js';
import { analyticsEvents, EventType } from '../db/schema/index.js';

export class AnalyticsRepository {
  constructor() {
    this.db = getDatabase();
  }

  /**
   * Log an analytics event
   */
  async logEvent(eventType, { sessionId = null, siteId = null, metadata = null } = {}) {
    const [event] = await this.db
      .insert(analyticsEvents)
      .values({
        eventType,
        sessionId,
        siteId,
        metadata,
      })
      .returning();

    return event;
  }

  /**
   * Get events by type
   */
  async getEventsByType(eventType, limit = 100) {
    return await this.db.query.analyticsEvents.findMany({
      where: eq(analyticsEvents.eventType, eventType),
      orderBy: desc(analyticsEvents.timestamp),
      limit,
    });
  }

  /**
   * Get events by site
   */
  async getEventsBySite(siteId, limit = 100) {
    return await this.db.query.analyticsEvents.findMany({
      where: eq(analyticsEvents.siteId, siteId),
      orderBy: desc(analyticsEvents.timestamp),
      limit,
    });
  }

  /**
   * Get events in date range
   */
  async getEventsByDateRange(startDate, endDate) {
    return await this.db.query.analyticsEvents.findMany({
      where: and(
        gte(analyticsEvents.timestamp, startDate),
        lte(analyticsEvents.timestamp, endDate)
      ),
      orderBy: desc(analyticsEvents.timestamp),
    });
  }

  /**
   * Get event counts by type (for dashboard stats)
   */
  async getEventCounts(startDate = null, endDate = null) {
    let query = this.db
      .select({
        eventType: analyticsEvents.eventType,
        count: sql`count(*)::int`,
      })
      .from(analyticsEvents)
      .groupBy(analyticsEvents.eventType);

    if (startDate && endDate) {
      query = query.where(
        and(
          gte(analyticsEvents.timestamp, startDate),
          lte(analyticsEvents.timestamp, endDate)
        )
      );
    }

    return await query;
  }

  /**
   * Get hourly event counts (for charts)
   */
  async getHourlyEventCounts(eventType, hours = 24) {
    const startDate = new Date();
    startDate.setHours(startDate.getHours() - hours);

    const results = await this.db
      .select({
        hour: sql`date_trunc('hour', ${analyticsEvents.timestamp})`,
        count: sql`count(*)::int`,
      })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.eventType, eventType),
          gte(analyticsEvents.timestamp, startDate)
        )
      )
      .groupBy(sql`date_trunc('hour', ${analyticsEvents.timestamp})`)
      .orderBy(sql`date_trunc('hour', ${analyticsEvents.timestamp})`);

    return results;
  }

  /**
   * Get AI response metrics
   */
  async getAIMetrics(startDate = null, endDate = null) {
    const conditions = [eq(analyticsEvents.eventType, EventType.AI_RESPONSE)];

    if (startDate && endDate) {
      conditions.push(gte(analyticsEvents.timestamp, startDate));
      conditions.push(lte(analyticsEvents.timestamp, endDate));
    }

    const events = await this.db.query.analyticsEvents.findMany({
      where: and(...conditions),
    });

    // Calculate metrics from metadata
    const metrics = {
      totalResponses: events.length,
      totalDuration: 0,
      totalTokens: 0,
      avgDuration: 0,
      avgTokens: 0,
      byProvider: {},
    };

    events.forEach(event => {
      if (event.metadata) {
        const { duration, tokenCount, provider } = event.metadata;

        if (duration) metrics.totalDuration += duration;
        if (tokenCount) metrics.totalTokens += tokenCount;

        if (provider) {
          if (!metrics.byProvider[provider]) {
            metrics.byProvider[provider] = { count: 0, duration: 0, tokens: 0 };
          }
          metrics.byProvider[provider].count++;
          if (duration) metrics.byProvider[provider].duration += duration;
          if (tokenCount) metrics.byProvider[provider].tokens += tokenCount;
        }
      }
    });

    if (events.length > 0) {
      metrics.avgDuration = Math.round(metrics.totalDuration / events.length);
      metrics.avgTokens = Math.round(metrics.totalTokens / events.length);
    }

    return metrics;
  }

  /**
   * Clean up old events (retention policy)
   */
  async deleteOldEvents(daysOld = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const deleted = await this.db
      .delete(analyticsEvents)
      .where(lte(analyticsEvents.timestamp, cutoffDate))
      .returning();

    return deleted.length;
  }
}

// Export singleton instance
export const analyticsRepository = new AnalyticsRepository();
