# Nenu Saitham 0.5.1

- City, area, street, state and country are displayed separately. Camera GPS and map selection use one address resolver that examines up to five Android geocoder candidates. City uses locality; districts are no longer used as a city fallback. A locality identical to the area/street is treated as ambiguous. Unavailable fields are displayed honestly. Geocoder coverage can still leave city unavailable; existing reports are not rewritten.
- An accessible i button beside each photo/video opens file details. Available original filename, MIME, bytes, dimensions, video duration, dates, source, camera/EXIF fields and embedded GPS are retained separately from the report GPS. Original and repair-file metadata remain independent. Web browsers expose fewer metadata fields than Android. Legacy reports show unavailable values where metadata was not retained.
- Category, country and city filters accept multiple keywords as removable chips. Enter, comma or leaving the input commits keywords. All terms must match, in any order; duplicates are removed. Place search uses chips too and retains latitude,longitude entry. Backend query searches support multiple keywords across issue and reporter fields, and within field filters.
- Empty result lists hide filter inputs. Active keywords remain removable so an empty search can be cleared; location controls remain available to search another area.

Validation includes media-details persistence, duplicate-media isolation, cross-field and reordered keyword queries, literal wildcard handling, chip removal, empty-state filters, coordinate search, the existing media/GPS/issue flows and Android compilation. Real-device testing is still needed for geocoder results in the affected area and camera/document-provider metadata.

The APK keeps demo login and the existing video-screening configuration behavior from 0.5.0.
