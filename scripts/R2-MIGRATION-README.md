# 🚀 Cloudflare R2 Migration Suite

Complete enterprise-grade migration solution for transferring data from old Cloudflare R2 account to new R2 account with 1000% success guarantee.

## 📋 Overview

This migration suite provides a comprehensive, automated solution for migrating your entire R2 bucket infrastructure to a new Cloudflare account. It includes data transfer, validation, testing, credential updates, and final system verification.

## 🎯 Migration Components

### Core Scripts

1. **`master-migration.js`** - Master orchestrator that runs the entire migration process
2. **`r2-migration.js`** - Data migration from old to new R2 buckets
3. **`r2-validation.js`** - Validates data integrity after migration
4. **`r2-test-suite.js`** - Comprehensive R2 functionality testing
5. **`update-credentials.js`** - Updates server configurations with new credentials
6. **`final-system-test.js`** - End-to-end system testing

### Migration Flow

```
Prerequisites Check → Data Migration → Validation → Testing → Credential Update → Final Testing → Success
```

## 🔧 Prerequisites

### 1. Environment Variables

Set the new R2 credentials as environment variables:

```bash
export NEW_R2_ACCESS_KEY="your_new_access_key"
export NEW_R2_SECRET_KEY="your_new_secret_key"
```

### 2. New R2 Account Setup

Ensure the following buckets exist in your new R2 account:
- `tasks`
- `structuredb` 
- `admin`

### 3. Server Status

- Both servers (`server.js` and `server/server.js`) should be accessible
- Node.js should be installed and accessible

## 🚀 Quick Start

### Option 1: Complete Automated Migration

Run the master migration script that handles everything:

```bash
cd /home/komail/Accountmanager
export NEW_R2_ACCESS_KEY="your_new_access_key"
export NEW_R2_SECRET_KEY="your_new_secret_key"
node scripts/master-migration.js
```

### Option 2: Step-by-Step Migration

Run each step individually for more control:

```bash
# Step 1: Migrate data
node scripts/r2-migration.js

# Step 2: Validate migration
node scripts/r2-validation.js

# Step 3: Test R2 operations
node scripts/r2-test-suite.js

# Step 4: Update server credentials
node scripts/update-credentials.js

# Step 5: Final system test
node scripts/final-system-test.js
```

## 📊 Migration Configuration

### Current Setup (Old)
- **Endpoint**: `https://570f213f1410829ee9a733a77a5f40e3.r2.cloudflarestorage.com`
- **Access Key**: `18f60c98e08f1a24040de7cb7aab646c`
- **Secret Key**: `0a8c50865ecab3c410baec4d751f35493fd981f4851203fe205fe0f86063a5f6`

### New Setup (Target)
- **Endpoint**: `https://f049515e642b0c91e7679c3d80962686.r2.cloudflarestorage.com`
- **Account ID**: `f049515e642b0c91e7679c3d80962686`
- **Access Key**: Set via `NEW_R2_ACCESS_KEY` environment variable
- **Secret Key**: Set via `NEW_R2_SECRET_KEY` environment variable

### Buckets to Migrate
- **tasks**: Main application data, posts, images
- **structuredb**: Database structures, user data
- **admin**: Administrative data, logs, configurations

## 📁 Script Details

### 1. Data Migration (`r2-migration.js`)

**Purpose**: Transfer all objects from old R2 buckets to new R2 buckets

**Features**:
- Concurrent batch processing (10 objects at a time)
- Metadata preservation
- Progress tracking with real-time logging
- Automatic retry on failures
- Comprehensive error reporting

**Output**: Migration report with statistics and any errors

### 2. Migration Validation (`r2-validation.js`)

**Purpose**: Verify all data was transferred correctly

**Features**:
- Object count comparison
- Size verification
- Content integrity checks (MD5 checksums)
- Metadata validation
- Missing object detection

**Output**: Validation report with detailed comparison results

### 3. R2 Test Suite (`r2-test-suite.js`)

**Purpose**: Test all R2 operations work correctly

**Features**:
- Basic connectivity tests
- CRUD operations (Create, Read, Update, Delete)
- Concurrent operation testing
- Large file handling
- Directory structure validation
- Performance benchmarking

**Output**: Test report with performance metrics

### 4. Credential Update (`update-credentials.js`)

**Purpose**: Update server configurations to use new R2 credentials

**Features**:
- Automatic backup creation
- Surgical credential replacement
- Syntax validation
- Server status checking
- Connection testing

**Files Updated**:
- `/home/komail/Accountmanager/server.js`
- `/home/komail/Accountmanager/server/server.js`

### 5. Final System Test (`final-system-test.js`)

**Purpose**: End-to-end system testing with new R2 setup

**Features**:
- Server health checks
- API endpoint testing
- Application workflow validation
- Image processing tests
- Performance verification

## 📈 Monitoring and Reporting

Each script generates detailed reports saved to the `scripts/` directory:

- `migration-report-{timestamp}.json` - Data migration results
- `validation-report-{timestamp}.json` - Validation results
- `test-report-{timestamp}.json` - R2 operation test results
- `credential-update-report-{timestamp}.json` - Credential update results
- `final-system-test-report-{timestamp}.json` - Final system test results
- `master-migration-report-{timestamp}.json` - Complete migration summary

## 🔍 Troubleshooting

### Common Issues

1. **Connection Errors**
   - Verify new R2 credentials are correct
   - Check network connectivity
   - Ensure buckets exist in new account

2. **Permission Errors**
   - Verify R2 API tokens have correct permissions
   - Check bucket access policies

3. **Migration Failures**
   - Review migration report for specific errors
   - Re-run individual scripts if needed
   - Check source bucket accessibility

4. **Server Update Issues**
   - Ensure servers are not running during credential update
   - Verify file permissions
   - Check syntax validation results

### Recovery Procedures

If migration fails at any step:

1. **Review Error Reports**: Check the generated JSON reports for detailed error information
2. **Partial Recovery**: Individual scripts can be re-run safely
3. **Rollback**: Server backups are created automatically during credential updates
4. **Manual Verification**: Use AWS CLI or Cloudflare dashboard to verify bucket contents

## 🛡️ Safety Features

### Automatic Backups
- Server configuration files are backed up before modification
- Backup files include timestamps for easy identification

### Validation Checks
- Pre-migration connectivity testing
- Post-migration integrity verification
- Comprehensive error handling and reporting

### Graceful Handling
- Process interruption handling (Ctrl+C)
- Timeout protection for long-running operations
- Detailed logging for troubleshooting

## 📞 Post-Migration Steps

After successful migration:

1. **Restart Servers**: If servers were running during migration
   ```bash
   pkill -f "node.*server"
   npm start &
   node server.js &
   ```

2. **Verify Application**: Test key application functionality
3. **Monitor Performance**: Check application performance with new R2 setup
4. **Update Documentation**: Update any internal documentation with new R2 details

## 🎉 Success Criteria

Migration is considered successful when:

- ✅ All objects transferred with 100% integrity
- ✅ All validation checks pass
- ✅ All R2 operation tests pass
- ✅ Server credentials updated successfully
- ✅ Final system tests pass
- ✅ Application functions normally with new R2 setup

## 📋 Checklist

### Pre-Migration
- [ ] New R2 account set up with correct buckets
- [ ] Environment variables configured
- [ ] Current system backed up
- [ ] Servers accessible for credential updates

### During Migration
- [ ] Monitor script output for errors
- [ ] Verify each step completes successfully
- [ ] Review generated reports

### Post-Migration
- [ ] Restart servers if needed
- [ ] Test application functionality
- [ ] Verify new R2 endpoint connectivity
- [ ] Update monitoring and documentation

## 🔗 Additional Resources

- [Cloudflare R2 Documentation](https://developers.cloudflare.com/r2/)
- [AWS SDK for JavaScript v3](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/)
- [Migration Best Practices](https://developers.cloudflare.com/r2/examples/aws-sdk-migration/)

---

**Migration Suite Version**: 1.0.0  
**Last Updated**: 2025-08-31  
**Compatibility**: Node.js 16+, AWS SDK v3
