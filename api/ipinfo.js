const COUNTRY_REGION_DATA_URL = "https://unpkg.com/country-region-data@3.1.0/data.json";

let _countryRegionData = null;
let _countryRegionDataPromise = null;

async function loadCountryRegionData() {
  if (_countryRegionData) return _countryRegionData;
  if (_countryRegionDataPromise) return _countryRegionDataPromise;

  _countryRegionDataPromise = fetch(COUNTRY_REGION_DATA_URL)
    .then((r) => {
      if (!r.ok) throw new Error(`Failed to load country-region-data (${r.status})`);
      return r.json();
    })
    .then((json) => {
      _countryRegionData = json;
      return _countryRegionData;
    })
    .catch((err) => {
      _countryRegionDataPromise = null;
      throw err;
    });

  return _countryRegionDataPromise;
}

function pickRemoteIp(headerIp, socketRemote) {
  if (headerIp) {
    return String(headerIp).split(",")[0].trim();
  }
  return socketRemote || "Unknown";
}

export default async function handler(request, response) {
  try {
    const apiKey = request.query?.key;
    const validApiKey = process.env.API_KEY;

    if (!apiKey || apiKey !== validApiKey) {
      return response.status(401).json({ error: "Invalid or missing API key" });
    }

    const ip = pickRemoteIp(request.headers["x-forwarded-for"] || request.headers["x-vercel-forwarded-for"], request.socket?.remoteAddress || request.connection?.remoteAddress);
    const city = request.headers["x-vercel-ip-city"] || request.headers["x-city"] || "Unknown";

    const countryCodeRaw = (request.headers["x-vercel-ip-country"] || request.headers["x-country"] || "Unknown").toString().toUpperCase();

    const regionRaw = (request.headers["x-vercel-ip-country-region"] || request.headers["x-region"] || "Unknown").toString();

    let countryName = countryCodeRaw;
    let regionName = regionRaw;

    try {
      const data = await loadCountryRegionData();
      if (data && Array.isArray(data) && countryCodeRaw && countryCodeRaw !== "UNKNOWN") {
        const countryObj = data.find(
          (c) => (c.countryShortCode || "").toString().toUpperCase() === countryCodeRaw
        );

        if (countryObj) {
          countryName = countryObj.countryName || countryCodeRaw;
          let regionPart = regionRaw;
          if (typeof regionPart === "string" && regionPart.includes("-")) {
            const parts = regionPart.split("-");
            regionPart = parts.length >= 2 ? parts[1] : parts[0];
          }

          if (regionPart && regionPart !== "Unknown") {
            const found = (countryObj.regions || []).find((r) => {
              const sc = (r.shortCode || "").toString().toUpperCase();
              const rn = (r.name || "").toString().toUpperCase();
              return sc === regionPart.toString().toUpperCase() || rn === regionPart.toString().toUpperCase();
            });

            if (found) {
              regionName = found.name;
            } else {
              const suffixMatch = (countryObj.regions || []).find((r) => {
                const sc = (r.shortCode || "").toString();
                return sc.split("-").pop().toUpperCase() === regionPart.toString().toUpperCase();
              });
              if (suffixMatch) regionName = suffixMatch.name;
              else regionName = regionPart;
            }
          } else {
            regionName = regionRaw;
          }
        } else {
          countryName = countryCodeRaw;
          regionName = regionRaw;
        }
      }
    } catch (err) {
      console.error("country-region-data load error:", err?.message || err);
      countryName = countryCodeRaw;
      regionName = regionRaw;
    }

    return response.status(200).json({
      ip: ip,
      city: city,
      country_code: countryCodeRaw,
      country_name: countryName,
      region_code: regionRaw,
      region: regionName,
    });
  } catch (err) {
    console.error("handler unexpected error:", err);
    return response.status(500).json({ error: "Internal Server Error" });
  }
}
