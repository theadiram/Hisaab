"""Official state/UT procurement portal directory from the CPPP/GePNIC list.

This is a discovery index only. Portal presence is not proof that a portal has
structured exports, accessible awards, payment records, or publication rights.
"""

DIRECTORY_URL = (
    "https://eprocure.gov.in/mmp/sites/default/files/eproc/States_eProc_relatedlinks.pdf"
)

# Preserve the official directory's URLs, including separate local systems.
# The source directory labels starred jurisdictions as using systems other than
# NIC GePNIC. A&N is listed as ePublishing only, which is not equivalent to a
# public tender-and-award catalogue.
PORTALS = {
    "Andhra Pradesh": [("https://www.eprocurement.gov.in/", "shared_cppp", "directory_entry")],
    "Arunachal Pradesh": [
        ("https://arunachaltenders.gov.in/nicgep/app", "nic_gepnic", "directory_entry")
    ],
    "Assam": [("https://assamtenders.gov.in/nicgep/app", "nic_gepnic", "directory_entry")],
    "Andaman and Nicobar Islands": [
        ("https://eprocure.gov.in/epublish/app", "cppp_epublishing", "epublishing_only"),
        (
            "https://eprocure.andamannicobar.gov.in/nicgep/app",
            "nic_gepnic",
            "supplemental_official_route",
        ),
    ],
    "Bihar": [("https://www.eproc.bihar.gov.in", "state_platform", "directory_entry")],
    "Chandigarh": [("https://etenders.chd.nic.in", "nic_gepnic", "directory_entry")],
    "Chhattisgarh": [("https://cgeprocurement.gov.in", "state_platform", "directory_entry")],
    "Dadra and Nagar Haveli and Daman and Diu": [
        ("https://dnhtenders.gov.in/nicgep/app", "nic_gepnic_dnh", "directory_entry"),
        ("https://ddtenders.gov.in/nicgep/app", "nic_gepnic_dd", "directory_entry"),
    ],
    "Delhi": [("https://govtprocurement.delhi.gov.in", "nic_gepnic", "directory_entry")],
    "Goa": [("https://www.etender.goa.gov.in", "state_platform", "directory_entry")],
    "Gujarat": [
        (
            "https://www.nprocure.com/asp/home/new_home_tenders.asp",
            "state_platform",
            "directory_entry",
        )
    ],
    "Haryana": [
        ("https://etenders.hry.nic.in", "nic_gepnic", "directory_entry"),
        ("https://haryanaphed.etenders.in", "department_platform", "directory_entry"),
    ],
    "Himachal Pradesh": [("https://hptenders.gov.in", "nic_gepnic", "directory_entry")],
    "Jammu and Kashmir": [("https://jktenders.gov.in", "nic_gepnic", "directory_entry")],
    "Jharkhand": [("https://jharkhandtenders.gov.in", "nic_gepnic", "directory_entry")],
    "Karnataka": [("https://eproc.karnataka.gov.in", "state_platform", "directory_entry")],
    "Kerala": [("https://etenders.kerala.gov.in", "nic_gepnic", "directory_entry")],
    "Lakshadweep": [("https://tendersutl.gov.in/nicgep/app", "nic_gepnic", "directory_entry")],
    "Ladakh": [
        ("https://tenders.ladakh.gov.in/nicgep/app", "nic_gepnic", "supplemental_official_route")
    ],
    "Madhya Pradesh": [
        ("https://mptenders.gov.in/nicgep/app", "nic_gepnic", "directory_entry"),
        ("https://mpeprocurement.com", "state_platform", "directory_entry"),
    ],
    "Maharashtra": [
        ("https://mahatenders.gov.in", "nic_gepnic", "directory_entry"),
        ("https://maharashtra.etenders.in", "department_platform", "directory_entry"),
    ],
    "Manipur": [("https://manipurtenders.gov.in", "nic_gepnic", "directory_entry")],
    "Meghalaya": [("https://meghalayatenders.gov.in", "nic_gepnic", "directory_entry")],
    "Mizoram": [("https://mizoramtenders.gov.in", "nic_gepnic", "directory_entry")],
    "Nagaland": [("https://nagalandtenders.gov.in", "nic_gepnic", "directory_entry")],
    "Odisha": [("https://tendersodisha.gov.in", "nic_gepnic", "directory_entry")],
    "Punjab": [
        ("http://eprocpbpwd.gov.in", "department_platform", "directory_entry"),
        ("https://etender.punjabgovt.gov.in", "state_platform", "directory_entry"),
    ],
    "Puducherry": [("https://pudutenders.gov.in", "nic_gepnic", "directory_entry")],
    "Rajasthan": [("https://eproc.rajasthan.gov.in", "nic_gepnic", "directory_entry")],
    "Sikkim": [("http://sikkimtender.gov.in", "nic_gepnic", "directory_entry")],
    "Tamil Nadu": [("https://tntenders.gov.in", "nic_gepnic", "directory_entry")],
    "Telangana": [("https://www.eprocurement.gov.in/", "shared_cppp", "directory_entry")],
    "Tripura": [("http://tripuratenders.gov.in", "nic_gepnic", "directory_entry")],
    "Uttar Pradesh": [("https://etender.up.nic.in", "nic_gepnic", "directory_entry")],
    "Uttarakhand": [("https://uktenders.gov.in", "nic_gepnic", "directory_entry")],
    "West Bengal": [("https://wbtenders.gov.in", "nic_gepnic", "directory_entry")],
}


def source_for(jurisdiction):
    portals = PORTALS.get(jurisdiction, [])
    if not portals:
        return {
            "status": "directory_entry_missing",
            "portals": [],
            "source": DIRECTORY_URL,
            "paymentEvidence": False,
        }
    supplemental = {
        "Andaman and Nicobar Islands": "https://eprocure.andamannicobar.gov.in/",
        "Ladakh": "https://tenders.ladakh.gov.in/",
    }
    return {
        "status": "official_directory_route_identified",
        "portals": [
            {
                "url": url,
                "platform": platform,
                "directoryStatus": status,
                "source": supplemental.get(jurisdiction, DIRECTORY_URL)
                if status == "supplemental_official_route"
                else DIRECTORY_URL,
            }
            for url, platform, status in portals
        ],
        "source": DIRECTORY_URL,
        "paymentEvidence": False,
    }


def validate_scope():
    expected = {
        "Andhra Pradesh",
        "Arunachal Pradesh",
        "Assam",
        "Bihar",
        "Chhattisgarh",
        "Goa",
        "Gujarat",
        "Haryana",
        "Himachal Pradesh",
        "Jharkhand",
        "Karnataka",
        "Kerala",
        "Madhya Pradesh",
        "Maharashtra",
        "Manipur",
        "Meghalaya",
        "Mizoram",
        "Nagaland",
        "Odisha",
        "Punjab",
        "Rajasthan",
        "Sikkim",
        "Tamil Nadu",
        "Telangana",
        "Tripura",
        "Uttar Pradesh",
        "Uttarakhand",
        "West Bengal",
        "Andaman and Nicobar Islands",
        "Chandigarh",
        "Dadra and Nagar Haveli and Daman and Diu",
        "Delhi",
        "Jammu and Kashmir",
        "Ladakh",
        "Lakshadweep",
        "Puducherry",
    }
    missing = expected - set(PORTALS)
    extra = set(PORTALS) - expected
    listed_in_directory = {name for name in PORTALS if name != "Ladakh"}
    return {
        "expected": len(expected),
        "mapped": len(PORTALS),
        "missing": sorted(missing),
        "extra": sorted(extra),
        "directlyListed": len(listed_in_directory),
        "supplementalRoutes": ["Andaman and Nicobar Islands", "Ladakh"],
    }


if __name__ == "__main__":
    import json

    print(json.dumps(validate_scope(), indent=2))
