// ── Pinnacle Smart Advisor — Central Data Registry ────────────────────────────
// Re-exports all structured demo data from domain-specific mock files.
// Maintained for backwards compatibility. New code should prefer importing
// directly from `src/mock/*` modules.

import { seedLoanApplications, seedRepayments } from './mock/loans';
import { seedCustomers } from './mock/customers';
import { seedSmeBusinesses } from './mock/businesses';
import { seedAlertNotifications } from './mock/notifications';
import { seedChats } from './mock/chats';

// Re-export all domain collections with demo tagging
export const initialLoanApplications = seedLoanApplications.map(a => ({ ...a, dataSource: 'demo' as const }));
export const initialRepayments = seedRepayments;
export const initialCustomers = seedCustomers.map(c => ({ ...c, dataSource: 'demo' as const }));
export const initialSmeBusinesses = seedSmeBusinesses;
export const initialAlertNotifications = seedAlertNotifications;
export const initialChats = seedChats;

// Static UI Assets (Avatars / Mock Images)
export const USER_AVATAR = "https://lh3.googleusercontent.com/aida-public/AB6AXuCDV1O6eCVqOUBk2ibttmKw-dMN72Ta2B63RCsSCN3s5GXR5GA0EuVSsGRqFHIt3g8yyy4Ac1UHDClDv-4pjpa2uTud0i1DFEW6kMtsG0L0ln4Lv5Eh49HRVsBxIMIY12IlkzgfkNpD-dtLSODZ7Tkxgun9zYUo4lSNLQeIfR_h7Vl7sTlVakV5BjyYA6To8gO5xeLHfrpoO5J7MBRrFwzGSoQZke8pYuDGACu1xVf2I1KdlxaIrusd";
export const USER_AVATAR_ALTERNATIVE = "https://lh3.googleusercontent.com/aida-public/AB6AXuClg5yZAenqTOpSYxGD48gsJ7NWSo2A2VSN2PCk1C5J6py6vA6smsKwQ9NJrsOP3ohv2qZOu2lg82BCzuZyznwlY3RR9B7W3owSc1tUtOe9uqsV4SEN5NPYHZ2wXfKU87W_RuinqhGmrTnipWI3h1F6_PFL4dl0wrD6g8k2cb8H1XLnqWEfw74M5g5JhI8eVH6oqH_Gc_ls4InbqQ8XxAGPf3SvmLM9OCKpCuvR0g2FQZiXwGznTuOn";
export const USER_AVATAR_PROFILE = "https://lh3.googleusercontent.com/aida-public/AB6AXuDXLMwoa9z2BnpCasmYRxJd0b60PoY6n2olBxh1AL_H5ZNPQObWvGHzj3ZGuO3clKuNSN1Iy72BPD_E01vw5bsOxLqUKVqdM2W8yNWeTH18Mr_pFC_IEyNSp6qE9dh_2fpkbNU7pc9n1CPeozbG6R-kP7fEavndYOhcWgKu6iFkD5A-obu6_qqGbtoRE73tIwz54boIzKX4-bc8c-oztJ1CuN-z1YjfaPAWOdnRxSJVELERJqySl3_Z";

export const OFFICER_AVATAR = "https://lh3.googleusercontent.com/aida-public/AB6AXuCDr9EJmdDNBfn8FrHaLvxFWgy5UTJ8j9tpfuQira5cjeOBq1fd5jY3XOeJCKpmgpZd5BNAxW-H49D-U65_tGopCQTGjgDG_2WI3hp2HkVrkGFdkF6ZYvMWFAEZJ5UB4rx9gf5aRWMSfn4Qk7dGjAjqC2dg8V0dTF0YKxWud_JHS3OEhsQrp4-LqKnMA_0t2JVU1LiCX3sw2kZF33V5FoJUAd_rKrmfF1pS4jso3s_mu8UkDAUAJRkh";
export const ADVISOR_AVATAR = "https://lh3.googleusercontent.com/aida-public/AB6AXuDpuLvx0eKa2mw4q9BX8m_k_jzwEtKBmnQGRtoxPpKGMf-mjg4JBb7R8KfNhLOdvnpJFVVHvVsLNyJyucf7RWwFWuNtIIugU-7vsvsiFKlpgLUywKUcEo3GIzL1S-QkgtmvHuGIfUTKpypSSvbRS_oyFNvleKYBrfw5vpl3rSZ_mLWRpeeCsCFzRyVDuHjnD3wkV7Lmqhtf05lE6v2oyZ98AmIqJu1RKB5KnezXtDTPds7Wb11ZwYV4";
export const STAFF_AVATAR = "https://lh3.googleusercontent.com/aida-public/AB6AXuDu3Miije4oNNLbM1147dplN_wnyKf_nO2y3Yg4jAKQSVo5tL9TNock92MavnWmkZz-u36dIJ9WIDcxbUj7fBmVZ51l6KN3cxEqn0uBfOtK0RwaKGJqDMafIpJT2OMVzNaQo_OXXZz5A_kUWSyk_nLo06OqGRUowDdaFMbMLyBC9Rm8Pjjb9ulkUUWftM2YW7g--VoYdUAqAIijCxSh5yjYW9xaBFl2JhaYNuNd73fzcH2PnjGWzw6U";

export const MR_PHIRI_AVATAR = "https://lh3.googleusercontent.com/aida-public/AB6AXuBWBxjSs1oLgTKZ_kRhXTgi3qbKC6OxOBAXY5585FDkTRnwlOLEmpNpehu0aNeRfHfFmYB2gMt06plvCHaKVAmajyExtEnPVfe4tkfLIPRuvrh6fvP116F2rQ0f4woPrmqKxQeq1Veg0HCuvmsaIZ9KAwV2jBZeg92iDERGTzbz2uG4H2AUrB6_Y8_W7JJdUkSww2jnE28OxU9lKoR_T7eVBeudUG2hvUADBhJi0gpFOQGF6OiyT0jK";
export const MERCY_PHIRI_AVATAR = "https://lh3.googleusercontent.com/aida-public/AB6AXuADCk3R0k7GqoZ-V-5QwsZUhnYyYbAwbVMXNWVe2BxSR4ObaNCTvph1vhMzzWpeTJUNnhcS3dQ7hSzSgO6rLsJg4242RRYe4_vCUBe6QZA1lU3dvqtxlGQP2fw4w_Ckdhxs3xTZtHg8iJpk6XsDNLc2sRx6oUxg_TYM5SFZ1bCLZQCdsMfh5XS_duZfX4NlSHXweIZUDMP-tUGpFky-0m2YUKJhP_hITEOhYlasI5-_ThBvOwRmQ-nL";
export const DAVID_MWALE_AVATAR = "https://lh3.googleusercontent.com/aida-public/AB6AXuAYaxlIaCsQUwgKwT7N8xBOaWwCsXK-YXeZbsHcFMCaJvXO3yOmoMMw0b3Fsz3lYidFvDXtbxg5pmbRns2OKuQPwVnzJ3REdE8GNyfpVlOaBRquZXs-N3YX8FoYsap51p6ltaveDZKlpFDI_MUGcoGqFxY-W3UWPX8kpCCrMC00Fu-l1ImEPTXIe4ql_vqZKhQKhrn0gmoaYALTNGo31IaHw9fxo7wf4EyNJ8-YGYQ6iplPrhjEvVOJ";
export const JOHN_BANDA_AVATAR = "https://lh3.googleusercontent.com/aida-public/AB6AXuBUfh_8Lepyc0sw1xbZC8YR5XDCnJ862BVbvnuBTsC6XCMJqRc3WgXfBOI-e9E2xCqRFTY-ef3MgwS7u7l0J8IZhGAYa8rA0vDkcUbk0WkTv_gs_nm2m7f5sTLRvaHE4Dunk-0aolIltjzTAgCj_hXDWq6Avrj2OL0ctGV6FinHP3fs4jP9MYKpB0UNr1wqHlhNwEEAczwVLBBsdBe-mxPa6nzAfvVyb5uSje8nFM7WjGSV7X4vd8iO";

export const OPPORTUNITY_IMAGE = "https://lh3.googleusercontent.com/aida-public/AB6AXuBNGH5FAv3P9XLXw-hjUrd0VsH1JpHq4i81xRixkAXdCMROCr5S4Z96oQs_-oUDH-s9zMA4TRj-wG2wcUxOPcxhH492PO1Dfd6uizX0dF1gYVWTAGaaSE_DNeZHInuK5nlHQGo1mQkdmAHTD7ONafrUS84c5PXl4oeKQWaDpPGYz1ls44tLEcZ4hWu5mUl_3mpeah0SF0wUZGjeXwy8-WgUEd7cXzKt1HeOMZyTrBS8j4x-cm1oDhcZ";
export const NATIONAL_ID_IMAGE = "https://lh3.googleusercontent.com/aida-public/AB6AXuC8uE8AmH92kIchlpHrkB83WNYe-5atN0k5dwGEny6ucTwAtQgBK2LCtJbm7rypLLmpRvZu4uMf6RM79dN65KXDJadgr9xG0x55AAw1q48q2q2Mv2PuxKzEeb2QJRAcAOb7KHUsGBhrcWzQcbKe7w74LNswXkYKm24rrPOnk6IXMORPW_hWaxIs3KVhzN_WsVT4DUXKr2zHx46k-B9U6fonS0ruF8DnlJKj77gtoVHiVRnkUSWsGVJe";
export const PROOF_OF_ADDRESS_IMAGE = "https://lh3.googleusercontent.com/aida-public/AB6AXuCyHqCNkpR6EgaGDy24n4wJxkjR3Szq5hpmOJVPQinA-8ZZ6qs2-_DJtuKaY-tT9aPZItMIP-7KSxy05CvqmD02SABTqC33JmyHp4E2ByNYMVAkXBhJuINTFY7ko5sryj1tujOfYJOWSv0_Rn3IgExuTkR6LOGF9RJRqr-PPKLHrVYOWaUVKSSkSuS1mwk0gNIXxDkS50UAO2HybGhKnhQ-NEA-cDs0ewCj83RAgBb3CIqOUR8jDWY_";
