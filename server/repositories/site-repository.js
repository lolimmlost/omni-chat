import { eq } from 'drizzle-orm';
import { getDatabase } from '../db/index.js';
import { sites } from '../db/schema/index.js';

export class SiteRepository {
  constructor() {
    this.db = getDatabase();
  }

  /**
   * Get site configuration by ID
   */
  async getSite(siteId) {
    const site = await this.db.query.sites.findFirst({
      where: eq(sites.id, siteId),
    });

    return site || null;
  }

  /**
   * Get site or fallback to default
   */
  async getSiteOrDefault(siteId) {
    let site = await this.getSite(siteId);

    if (!site) {
      site = await this.getSite('default');
    }

    return site;
  }

  /**
   * Get all sites
   */
  async getAllSites() {
    return await this.db.query.sites.findMany();
  }

  /**
   * Get enabled sites only
   */
  async getEnabledSites() {
    return await this.db.query.sites.findMany({
      where: eq(sites.enabled, 1),
    });
  }

  /**
   * Create a new site
   */
  async createSite(siteData) {
    const [site] = await this.db
      .insert(sites)
      .values({
        ...siteData,
        enabled: siteData.enabled !== undefined ? siteData.enabled : 1,
      })
      .returning();

    return site;
  }

  /**
   * Update site configuration
   */
  async updateSite(siteId, updates) {
    const [updated] = await this.db
      .update(sites)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(sites.id, siteId))
      .returning();

    return updated || null;
  }

  /**
   * Enable/disable site
   */
  async toggleSite(siteId, enabled) {
    return await this.updateSite(siteId, { enabled: enabled ? 1 : 0 });
  }

  /**
   * Update AI provider settings
   */
  async updateAIProvider(siteId, aiProvider, aiModel) {
    return await this.updateSite(siteId, { aiProvider, aiModel });
  }

  /**
   * Update site features
   */
  async updateFeatures(siteId, features) {
    const site = await this.getSite(siteId);
    if (!site) return null;

    const updatedFeatures = {
      ...site.features,
      ...features,
    };

    return await this.updateSite(siteId, { features: updatedFeatures });
  }

  /**
   * Update webhook configuration
   */
  async updateWebhooks(siteId, webhooks) {
    return await this.updateSite(siteId, { webhooks });
  }

  /**
   * Update branding
   */
  async updateBranding(siteId, branding) {
    const site = await this.getSite(siteId);
    if (!site) return null;

    const updatedBranding = {
      ...site.branding,
      ...branding,
    };

    return await this.updateSite(siteId, { branding: updatedBranding });
  }

  /**
   * Update response settings
   */
  async updateResponseSettings(siteId, responseSettings) {
    const site = await this.getSite(siteId);
    if (!site) return null;

    const updatedSettings = {
      ...site.responseSettings,
      ...responseSettings,
    };

    return await this.updateSite(siteId, { responseSettings: updatedSettings });
  }

  /**
   * Delete site
   */
  async deleteSite(siteId) {
    const deleted = await this.db
      .delete(sites)
      .where(eq(sites.id, siteId))
      .returning();

    return deleted.length > 0;
  }

  /**
   * Check if site exists
   */
  async exists(siteId) {
    const site = await this.db.query.sites.findFirst({
      where: eq(sites.id, siteId),
      columns: { id: true },
    });

    return !!site;
  }
}

// Export singleton instance
export const siteRepository = new SiteRepository();
