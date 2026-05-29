#include <CoreFoundation/CoreFoundation.h>
#include <IOKit/hid/IOHIDKeys.h>
#include <IOKit/hid/IOHIDManager.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>

static int number_property(IOHIDDeviceRef device, CFStringRef key) {
  CFTypeRef value = IOHIDDeviceGetProperty(device, key);
  if (!value || CFGetTypeID(value) != CFNumberGetTypeID()) return -1;
  int result = -1;
  CFNumberGetValue((CFNumberRef)value, kCFNumberIntType, &result);
  return result;
}

static void string_property(IOHIDDeviceRef device, CFStringRef key, char *buffer, size_t size) {
  buffer[0] = '\0';
  CFTypeRef value = IOHIDDeviceGetProperty(device, key);
  if (!value || CFGetTypeID(value) != CFStringGetTypeID()) return;
  CFStringGetCString((CFStringRef)value, buffer, size, kCFStringEncodingUTF8);
}

static void fill_dualsense_usb_report(unsigned char *report, size_t len, unsigned char right, unsigned char left, int v2) {
  memset(report, 0, len);
  report[0] = 0x02;
  report[1] = v2 ? 0x02 : 0x03;
  report[3] = right;
  report[4] = left;
  if (v2) report[39] = 0x04;
}

static IOReturn send_output(IOHIDDeviceRef device, const char *label, unsigned char *report, CFIndex len, int include_report_id) {
  unsigned char report_id = report[0];
  unsigned char *payload = include_report_id ? report : report + 1;
  CFIndex payload_len = include_report_id ? len : len - 1;
  IOReturn result = IOHIDDeviceSetReport(device, kIOHIDReportTypeOutput, report_id, payload, payload_len);
  printf("%s: reportId=0x%02x includeId=%d len=%ld result=0x%08x\n",
         label, report_id, include_report_id, (long)payload_len, result);
  return result;
}

static void rumble_variant(IOHIDDeviceRef device, const char *label, int v2, int include_report_id) {
  unsigned char report[48];
  fill_dualsense_usb_report(report, sizeof(report), 0xff, 0xff, v2);
  send_output(device, label, report, sizeof(report), include_report_id);
  usleep(700000);
  fill_dualsense_usb_report(report, sizeof(report), 0x00, 0x00, v2);
  send_output(device, "stop", report, sizeof(report), include_report_id);
  usleep(300000);
}

int main(int argc, char **argv) {
  int seize = argc > 1 && strcmp(argv[1], "--seize") == 0;
  IOHIDManagerRef manager = IOHIDManagerCreate(kCFAllocatorDefault, kIOHIDOptionsTypeNone);
  if (!manager) {
    fprintf(stderr, "Failed to create IOHIDManager\n");
    return 1;
  }

  CFMutableDictionaryRef match = CFDictionaryCreateMutable(kCFAllocatorDefault, 0, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
  int vendor = 0x054c;
  int product = 0x0ce6;
  CFNumberRef vendor_number = CFNumberCreate(kCFAllocatorDefault, kCFNumberIntType, &vendor);
  CFNumberRef product_number = CFNumberCreate(kCFAllocatorDefault, kCFNumberIntType, &product);
  CFDictionarySetValue(match, CFSTR(kIOHIDVendorIDKey), vendor_number);
  CFDictionarySetValue(match, CFSTR(kIOHIDProductIDKey), product_number);
  IOHIDManagerSetDeviceMatching(manager, match);
  CFRelease(vendor_number);
  CFRelease(product_number);
  CFRelease(match);

  IOReturn open_result = IOHIDManagerOpen(manager, seize ? kIOHIDOptionsTypeSeizeDevice : kIOHIDOptionsTypeNone);
  if (open_result != kIOReturnSuccess) {
    fprintf(stderr, "IOHIDManagerOpen failed: 0x%08x\n", open_result);
    CFRelease(manager);
    return 1;
  }

  CFSetRef devices = IOHIDManagerCopyDevices(manager);
  if (!devices || CFSetGetCount(devices) == 0) {
    fprintf(stderr, "No DualSense 0x054c/0x0ce6 devices found\n");
    if (devices) CFRelease(devices);
    CFRelease(manager);
    return 1;
  }

  CFIndex count = CFSetGetCount(devices);
  IOHIDDeviceRef device_list[count];
  CFSetGetValues(devices, (const void **)device_list);

  IOHIDDeviceRef selected = NULL;
  for (CFIndex index = 0; index < count; index++) {
    char product_name[256];
    char transport[128];
    string_property(device_list[index], CFSTR(kIOHIDProductKey), product_name, sizeof(product_name));
    string_property(device_list[index], CFSTR(kIOHIDTransportKey), transport, sizeof(transport));
    int usage_page = number_property(device_list[index], CFSTR(kIOHIDPrimaryUsagePageKey));
    int usage = number_property(device_list[index], CFSTR(kIOHIDPrimaryUsageKey));
    int max_output = number_property(device_list[index], CFSTR(kIOHIDMaxOutputReportSizeKey));
    printf("Found: product=\"%s\" transport=\"%s\" usagePage=%d usage=%d maxOutput=%d\n",
           product_name, transport, usage_page, usage, max_output);
    if (!selected && strcmp(transport, "USB") == 0) selected = device_list[index];
  }

  if (!selected) selected = device_list[0];
  IOReturn device_open = IOHIDDeviceOpen(selected, seize ? kIOHIDOptionsTypeSeizeDevice : kIOHIDOptionsTypeNone);
  if (device_open != kIOReturnSuccess) {
    fprintf(stderr, "IOHIDDeviceOpen failed: 0x%08x\n", device_open);
    CFRelease(devices);
    CFRelease(manager);
    return 1;
  }

  printf("Trying USB classic, payload without report id...\n");
  rumble_variant(selected, "classic/no-id", 0, 0);
  printf("Trying USB classic, payload with report id...\n");
  rumble_variant(selected, "classic/with-id", 0, 1);
  printf("Trying USB v2, payload without report id...\n");
  rumble_variant(selected, "v2/no-id", 1, 0);
  printf("Trying USB v2, payload with report id...\n");
  rumble_variant(selected, "v2/with-id", 1, 1);

  IOHIDDeviceClose(selected, kIOHIDOptionsTypeNone);
  CFRelease(devices);
  CFRelease(manager);
  return 0;
}
