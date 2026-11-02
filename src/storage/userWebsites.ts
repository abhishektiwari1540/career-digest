import crypto from "crypto";
import { supabase } from "./supabase.js";
import { config } from "../config.js";

export interface WebsitePageSeo {
  page_route: string; // e.g. "/", "/about", "/contact", "/services"
  meta_title: string;
  meta_description: string;
  meta_keywords: string;
  og_title: string;
  og_description: string;
  og_image?: string;
  canonical_url?: string;
  structured_jsonld?: any;
}

export interface UserWebsite {
  id: string; // e.g. site_abhishek_portfolio, site_1792...
  user_id?: string; // Associated User ID (e.g. usr_root_abhishektiwari)
  owner_email: string;
  site_name: string;
  site_url: string; // e.g. https://www.abhishektiwari.online/
  site_description: string;
  target_keywords: string[];
  pages_seo: Record<string, WebsitePageSeo>;
  created_at: string;
  updated_at: string;
}

// In-memory fallback cache
const memoryWebsites = new Map<string, UserWebsite>();

/**
 * Initialize default website from environment configuration
 */
export async function initDefaultWebsites() {
  const rootEmail = (config.adminEmail || "admin@yourdomain.com").trim().toLowerCase();
  const defaultSiteId = "site_default_portfolio";
  const name = config.candidateName || "Developer";

  if (!memoryWebsites.has(defaultSiteId)) {
    const defaultSite: UserWebsite = {
      id: defaultSiteId,
      user_id: "usr_root_admin",
      owner_email: rootEmail,
      site_name: `${name} - Portfolio & Second Brain`,
      site_url: "https://yourdomain.com/",
      site_description: `Official Portfolio of ${name} - Senior Full Stack Developer & AI LLM Integration Specialist.`,
      target_keywords: [
        `${name} developer`,
        "TypeScript AI Engineer",
        "Express.js Microservices",
        "Vector Search Engine"
      ],
      pages_seo: {
        "/": {
          page_route: "/",
          meta_title: `${name} | Senior Backend Developer & AI Engineer`,
          meta_description: `Portfolio of ${name} - Full Stack Developer & AI Specialist building microservices and vector search systems.`,
          meta_keywords: `${name}, Backend Developer, Node.js, TypeScript, AI Engineer`,
          og_title: `${name} | Developer Portfolio`,
          og_description: "Building scalable microservices and AI vector search applications.",
          og_image: "/og-image.jpg",
          canonical_url: "https://yourdomain.com/",
          structured_jsonld: {
            "@context": "https://schema.org",
            "@type": "Person",
            "name": name,
            "url": "https://yourdomain.com/",
            "jobTitle": "Senior Full Stack & AI Engineer"
          }
        },
        "/about": {
          page_route: "/about",
          meta_title: `About ${name} | Systems Architect`,
          meta_description: `Technical background and engineering architecture by ${name}.`,
          meta_keywords: `About ${name}, Developer Experience`,
          og_title: `About ${name} | Engineer`,
          og_description: "Architectural philosophy and production deployments.",
          og_image: "/og-image.jpg",
          canonical_url: "https://yourdomain.com/about",
          structured_jsonld: {
            "@context": "https://schema.org",
            "@type": "AboutPage",
            "name": `About ${name}`
          }
        },
        "/#contact": {
          page_route: "/#contact",
          meta_title: `Contact ${name} | Inquiries & Roles`,
          meta_description: `Get in touch with ${name} for software engineering inquiries.`,
          meta_keywords: `Contact ${name}, Software Engineer`,
          og_title: `Contact ${name}`,
          og_description: `Connect via email at ${rootEmail}.`,
          og_image: "/og-image.jpg",
          canonical_url: "https://yourdomain.com/#contact",
          structured_jsonld: {
            "@context": "https://schema.org",
            "@type": "ContactPage",
            "name": `Contact ${name}`
          }
        }
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    memoryWebsites.set(defaultSiteId, defaultSite);
  }
}

/**
 * List all websites owned by user (or all websites if projectadmin)
 */
export async function getUserWebsites(userEmail: string, role?: string, userId?: string): Promise<UserWebsite[]> {
  await initDefaultWebsites();

  const normalizedEmail = (userEmail || "").trim().toLowerCase();
  const adminEmail = (config.adminEmail || "").trim().toLowerCase();
  const isRoot = role === "projectadmin" || (Boolean(adminEmail) && normalizedEmail === adminEmail);
  const targetUserId = userId || (isRoot ? "usr_root_admin" : undefined);
  
  // Try fetching from Supabase
  try {
    let query = supabase.from("user_websites").select("*").order("created_at", { ascending: false });
    if (!isRoot) {
      if (targetUserId) {
        query = query.or(`owner_email.eq.${normalizedEmail},user_id.eq.${targetUserId}`);
      } else {
        query = query.eq("owner_email", normalizedEmail);
      }
    }
    const { data, error } = await query;
    if (!error && data && data.length > 0) {
      // Sync into memory cache
      data.forEach((row: any) => {
        const uId = row.user_id || (row.owner_email === adminEmail ? "usr_root_admin" : undefined);
        memoryWebsites.set(row.id, {
          id: row.id,
          user_id: uId,
          owner_email: row.owner_email,
          site_name: row.site_name,
          site_url: row.site_url,
          site_description: row.site_description || "",
          target_keywords: Array.isArray(row.target_keywords) ? row.target_keywords : [],
          pages_seo: typeof row.pages_seo === "object" ? row.pages_seo : {},
          created_at: row.created_at,
          updated_at: row.updated_at,
        });
      });
    }
  } catch {}

  const all = Array.from(memoryWebsites.values());
  if (isRoot) {
    return all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  return all.filter((w) => {
    if (targetUserId && w.user_id === targetUserId) return true;
    return w.owner_email.toLowerCase() === normalizedEmail;
  });
}

/**
 * Get a specific website by ID (Publicly accessible for script embed injection)
 */
export async function getWebsiteById(siteId: string): Promise<UserWebsite | null> {
  await initDefaultWebsites();

  if (memoryWebsites.has(siteId)) {
    return memoryWebsites.get(siteId)!;
  }

  try {
    const { data, error } = await supabase.from("user_websites").select("*").eq("id", siteId).maybeSingle();
    if (!error && data) {
      const site: UserWebsite = {
        id: data.id,
        owner_email: data.owner_email,
        site_name: data.site_name,
        site_url: data.site_url,
        site_description: data.site_description || "",
        target_keywords: Array.isArray(data.target_keywords) ? data.target_keywords : [],
        pages_seo: typeof data.pages_seo === "object" ? data.pages_seo : {},
        created_at: data.created_at,
        updated_at: data.updated_at,
      };
      memoryWebsites.set(siteId, site);
      return site;
    }
  } catch {}

  return null;
}

/**
 * Add a new website with auto-generated initial SEO pages
 */
export async function addUserWebsite(
  ownerEmail: string,
  data: {
    siteName: string;
    siteUrl: string;
    siteDescription?: string;
    targetKeywords?: string[];
  },
  userId?: string
): Promise<UserWebsite> {
  await initDefaultWebsites();

  const normalizedEmail = (ownerEmail || "").trim().toLowerCase();
  const adminEmail = (config.adminEmail || "").trim().toLowerCase();
  const isRoot = Boolean(adminEmail && normalizedEmail === adminEmail);
  const assignedUserId = userId || (isRoot ? "usr_root_admin" : `usr_${Date.now()}`);
  let cleanUrl = (data.siteUrl || "").trim();
  if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) {
    cleanUrl = "https://" + cleanUrl;
  }
  if (!cleanUrl.endsWith("/")) {
    cleanUrl += "/";
  }

  const siteId = `site_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
  const siteName = (data.siteName || "My Website").trim();
  const siteDesc = (data.siteDescription || `${siteName} - Official Web Application and Services`).trim();
  const keywords = (data.targetKeywords && data.targetKeywords.length > 0)
    ? data.targetKeywords
    : [siteName, "Web Development", "AI Platform", "Official Website"];

  // Generate Initial SEO pages for Home, About, Contact
  const pagesSeo: Record<string, WebsitePageSeo> = {
    "/": {
      page_route: "/",
      meta_title: `${siteName} | Modern Fast Cloud Platform`,
      meta_description: siteDesc,
      meta_keywords: keywords.join(", "),
      og_title: `${siteName} - Official Website`,
      og_description: siteDesc,
      og_image: `${cleanUrl}og-image.jpg`,
      canonical_url: cleanUrl,
      structured_jsonld: {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "name": siteName,
        "url": cleanUrl,
        "description": siteDesc
      }
    },
    "/about": {
      page_route: "/about",
      meta_title: `About | ${siteName}`,
      meta_description: `Learn more about ${siteName}, our mission, architecture, and technology capabilities.`,
      meta_keywords: `${keywords.join(", ")}, About`,
      og_title: `About ${siteName}`,
      og_description: `Our story, background, and core mission.`,
      og_image: `${cleanUrl}og-image.jpg`,
      canonical_url: `${cleanUrl}about`,
      structured_jsonld: {
        "@context": "https://schema.org",
        "@type": "AboutPage",
        "name": `About ${siteName}`,
        "url": `${cleanUrl}about`
      }
    },
    "/contact": {
      page_route: "/contact",
      meta_title: `Contact Us | ${siteName}`,
      meta_description: `Get in touch with the ${siteName} team for support, business inquiries, or collaboration.`,
      meta_keywords: `${keywords.join(", ")}, Contact, Support`,
      og_title: `Contact ${siteName}`,
      og_description: `Reach out to our team online.`,
      og_image: `${cleanUrl}og-image.jpg`,
      canonical_url: `${cleanUrl}contact`,
      structured_jsonld: {
        "@context": "https://schema.org",
        "@type": "ContactPage",
        "name": `Contact ${siteName}`,
        "url": `${cleanUrl}contact`
      }
    }
  };

  const newWebsite: UserWebsite = {
    id: siteId,
    user_id: assignedUserId,
    owner_email: normalizedEmail,
    site_name: siteName,
    site_url: cleanUrl,
    site_description: siteDesc,
    target_keywords: keywords,
    pages_seo: pagesSeo,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  memoryWebsites.set(siteId, newWebsite);

  // Save to Supabase (attempt with user_id, fallback without if column missing)
  try {
    const { error } = await supabase.from("user_websites").insert({
      id: siteId,
      user_id: assignedUserId,
      owner_email: normalizedEmail,
      site_name: siteName,
      site_url: cleanUrl,
      site_description: siteDesc,
      target_keywords: keywords,
      pages_seo: pagesSeo,
      created_at: newWebsite.created_at,
      updated_at: newWebsite.updated_at,
    });
    if (error && error.message?.includes("user_id")) {
      // Column might not exist in remote Supabase table yet, insert without user_id
      await supabase.from("user_websites").insert({
        id: siteId,
        owner_email: normalizedEmail,
        site_name: siteName,
        site_url: cleanUrl,
        site_description: siteDesc,
        target_keywords: keywords,
        pages_seo: pagesSeo,
        created_at: newWebsite.created_at,
        updated_at: newWebsite.updated_at,
      });
    }
  } catch (err: any) {
    console.warn("[userWebsites] Supabase insert notice:", err.message);
  }

  return newWebsite;
}

/**
 * Regenerate & Optimize SEO for a specific website
 */
export async function regenerateWebsiteSeo(
  siteId: string,
  userEmail: string,
  role?: string
): Promise<UserWebsite> {
  const site = await getWebsiteById(siteId);
  if (!site) {
    throw new Error("Website not found");
  }

  const normalizedEmail = (userEmail || "").trim().toLowerCase();
  if (role !== "projectadmin" && site.owner_email.toLowerCase() !== normalizedEmail) {
    throw new Error("Unauthorized to modify this website");
  }

  const cleanUrl = site.site_url;
  const siteName = site.site_name;
  const siteDesc = site.site_description;
  const keywords = site.target_keywords;

  site.pages_seo = {
    "/": {
      page_route: "/",
      meta_title: `${siteName} | AI-Optimized Cloud Platform & Solutions`,
      meta_description: siteDesc,
      meta_keywords: keywords.join(", "),
      og_title: `${siteName} | Modern High-Performance Experience`,
      og_description: siteDesc,
      og_image: `${cleanUrl}og-image.jpg`,
      canonical_url: cleanUrl,
      structured_jsonld: {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "name": siteName,
        "url": cleanUrl,
        "description": siteDesc
      }
    },
    "/about": {
      page_route: "/about",
      meta_title: `About ${siteName} | Engineering & Innovation`,
      meta_description: `Discover how ${siteName} builds advanced solutions, architecture principles, and developer tools.`,
      meta_keywords: `${keywords.join(", ")}, Technology, About`,
      og_title: `About ${siteName} - Innovation & Architecture`,
      og_description: `Learn more about our team and vision.`,
      og_image: `${cleanUrl}og-image.jpg`,
      canonical_url: `${cleanUrl}about`,
      structured_jsonld: {
        "@context": "https://schema.org",
        "@type": "AboutPage",
        "name": `About ${siteName}`,
        "url": `${cleanUrl}about`
      }
    },
    "/contact": {
      page_route: "/contact",
      meta_title: `Contact & Inquiries | ${siteName}`,
      meta_description: `Direct contact channels, inquiries, and customer communication for ${siteName}.`,
      meta_keywords: `${keywords.join(", ")}, Contact, Inquiries`,
      og_title: `Get in Touch with ${siteName}`,
      og_description: `Reach out to our leadership and engineering team.`,
      og_image: `${cleanUrl}og-image.jpg`,
      canonical_url: `${cleanUrl}contact`,
      structured_jsonld: {
        "@context": "https://schema.org",
        "@type": "ContactPage",
        "name": `Contact ${siteName}`,
        "url": `${cleanUrl}contact`
      }
    }
  };

  site.updated_at = new Date().toISOString();
  memoryWebsites.set(siteId, site);

  try {
    await supabase.from("user_websites").update({
      pages_seo: site.pages_seo,
      updated_at: site.updated_at,
    }).eq("id", siteId);
  } catch {}

  return site;
}

/**
 * Delete a website
 */
export async function deleteUserWebsite(
  siteId: string,
  userEmail: string,
  role?: string
): Promise<boolean> {
  const site = await getWebsiteById(siteId);
  if (!site) return false;

  const normalizedEmail = (userEmail || "").trim().toLowerCase();
  if (role !== "projectadmin" && site.owner_email.toLowerCase() !== normalizedEmail) {
    throw new Error("Unauthorized to delete this website");
  }

  // Prevent deleting the root default website for Abhishek
  if (siteId === "site_abhishek_portfolio") {
    throw new Error("The default root website cannot be deleted.");
  }

  memoryWebsites.delete(siteId);

  try {
    await supabase.from("user_websites").delete().eq("id", siteId);
  } catch {}

  return true;
}
