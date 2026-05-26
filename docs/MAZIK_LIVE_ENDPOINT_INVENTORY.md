# Mazik Live Endpoint Inventory

Captured on `2026-05-26` from the logged-in Chrome session using Chrome DevTools MCP.

## Hosts

- PMS UI: `https://livepms.maziksolutions.com`
- Purchase UI: `https://pclink.maziksolutions.com`
- Shared API host: `https://livepmsapi.maziksolutions.com/api`

All business requests observed were authenticated and carried a bearer token from the live session. Do not hardcode tokens; use login or refresh flows to establish a session.

## Auth And Common Session Endpoints

- `POST /api/auth/refresh`
- `GET /api/UserManagement/getNotifications/PMS,Purchase`
- `GET /api/VendorMaster/getAlerts/Purchase`
- `GET /api/VesselManagement/vessels/0`
- `GET /api/UserManagement/UserFleets/0/{userId}`
- `GET /api/UserManagement/accessrightbyurl/{userId}/{route}/{module}`
- `GET /api/UserManagement/getAccessRightsByUrlListNew?UserId={userId}&Module={module}&Urls={commaSeparatedRoutes}`

## PMS Link

### Observed UI Route

- `https://livepms.maziksolutions.com/pmsOverview/maintenanceForecast`

### Captured PMS Page Inventory

These route ids were returned through access-right requests for the PMS module:

- `maintenanceForecast`
- `defect`
- `counterUpdate`
- `completedMaintenances`
- `InventoryExplorer`
- `FileExplorer`
- `certificateExplorer`
- `sep`
- `dashboard`
- `categoryDefectChart`
- `reasonDefectChart`
- `trendDefectChart`
- `Requisitionslist`
- `RequisitionsNew`
- `RequisitionTracking`
- `vesselMaterialList`
- `vesselMaterial`
- `materiallist`
- `MaterialReceiptNew`
- `RequisitionTemplates`
- `position`
- `locationMaster`
- `spareAssemblysList`
- `listShipPms`
- `counterMaster`
- `maintenanceMasterList`
- `sparePartsMaster`
- `shipMaintenanceProcedure`
- `shipMaintenanceReference`
- `pages`
- `roleBasedAccessRights`
- `userBasedAccessRights`
- `vesselCertificate`
- `certificateScheduler`
- `defectChartConfiguration`
- `spareAssembly`
- `classificationSurvey`
- `groupMaster`
- `listmaintenance`
- `component`
- `spareparts`
- `stores`
- `cause`
- `pmsTemplate`
- `pmssetup`
- `postponeConfigComponent`
- `jSAmaster`
- `componentSetUp`

### Maintenance Forecast Screen

Main list endpoint captured after reloading `maintenanceForecast`:

- `GET /api/ShipMaster/shipMaintenanceDirectCompleteBySP`

Observed query pattern:

```text
/api/ShipMaster/shipMaintenanceDirectCompleteBySP
  ?PageNumber=0
  &FromDate=
  &ToDate=
  &PageSize=200
  &Status=0
  &KeyWord=
  &VesselId=141
  &FleetId=331
  &Excel=False
  &Type=Direct
  &Site=Office
```

Observed support calls for the same screen:

- `GET /api/UserManagement/accessrightbyurl/152/maintenanceForecast/PMS`
- `GET /api/UserManagement/Users/0`
- `GET /api/PMSGroup/causes/0`
- `GET /api/CategoryMaster/filterPriority/0`

Observed response shape for the list:

- `jobForcastId`
- `vesselId`, `vesselName`
- `shipMaintenanceId`
- `jobName`, `jobCode`
- `shipComponentName`, `shipComponentCode`
- `shipComponentJobLinkId`
- `userPosition`
- `jobGroup`
- `prioirty`
- `frequency`, `frequencyType`
- `alternateFrequency`, `alternateFrequencyType`
- `lastDoneDate`
- `nextScheduleDate`
- `dueDate`
- `jobStatus`
- `isPostpone`

### Maintenance Detail From Forecast

Clicking a job row on the forecast screen triggered:

- `GET /api/ShipMaster/shipMaintenanceForecastById/{shipComponentJobLinkId}`

Observed example:

- `GET /api/ShipMaster/shipMaintenanceForecastById/87196`

Observed response shape:

- `shipComponentJobLinkId`
- `shipComponentId`, `shipComponentName`, `shipComponentCode`
- `categoryName`
- `shipMaintenanceId`
- `jobName`, `jobCode`
- `jobType`, `jobGroup`
- `safetyProcedure`
- `operationalProcedure`
- `documentReference`
- `procedureReference`
- `priorityName`
- `isCritical`
- `jobDescription`
- `positionName`
- `alternateFrequency`, `alternateFrequencyType`
- `lastDoneDate`
- `windowStart`, `windowEnd`
- `jobForcastId`

### PMS Navigation Confirmed In The Live UI

These routes were directly visible in the left navigation on the forecast page:

- `pmsOverview/pmsOverview`
- `pmsOverview/maintenanceForecast`
- `pmsOverview/defect/MA==`
- `pmsOverview/counterUpdate/MA==/MA==/MA==`
- `pmsOverview/completedMaintenances`
- `pmsOverview/InventoryExplorer/MA==/MA==`
- `pmsOverview/certificateExplorer/MA==`
- `pmsOverview/RequisitionTemplates`

## Purchase Link

### Observed UI Routes

- `https://pclink.maziksolutions.com/Requisition/RequisitionTracking`
- `https://pclink.maziksolutions.com/Requisition/RequisitionsNew/MTcyMDk%3D`

### Captured Purchase Page Inventory

This came from the live `accessrightbyurlss` response for module `Purchase`.

#### Purchase Link

- `Rfqlist`
- `RequisitionsNew`
- `Requisitionslist`
- `InvoiceList`
- `createInvoice`
- `materiallist`
- `CreateDO`
- `QuotComparison`
- `PurchaseOrder`
- `CreditNotes`
- `vesselMaterialList`
- `RequisitionTracking`

#### Work Flow Master

- `wfevent`
- `wfworkflow`
- `wfgroup`
- `nigerian-currency`

#### Vendor Management

- `VendorRegistration`
- `VendorDetails`

#### Purchase Master

- `ExceptionMaster`
- `Ordertype`
- `MaterialQuality`
- `ProjectName`
- `priority`
- `service-category`
- `servicetype`
- `AdditionalCost`
- `QualityMaster`
- `CompanyMasterlist`
- `email`
- `AttachmentType`

### Requisition Tracking Screen

Main tracking list endpoint captured after reloading `RequisitionTracking`:

- `GET /api/PMRequisitionMaster/purchaseTracksLists`

Observed query pattern:

```text
/api/PMRequisitionMaster/purchaseTracksLists
  ?PageNumber=1
  &PageSize=200
  &Status=0
  &KeyWord=
  &VesselId=0
  &FleetId=331
  &targetLoc=Office
  &track=Requisition Track
  &stage=0
  &category=0
  &fromDate=2026-01-01
  &toDate=2026-05-07
  &hazCri=0
  &roleId=-1
  &excel=
  &department=0
  &ColumnName=
  &IsOpen=0
```

Observed support calls for the tracking screen:

- `GET /api/UserManagement/accessrightbyurlss/152/Purchase`
- `GET /api/UserManagement/accessrightbyurl/152/RequisitionTracking/Purchase`
- `GET /api/UserManagement/Departments/0`
- `GET /api/pmPurchaseMaster/GetRequisitionTrackModifyColumn/152/Requisition Track`
- `POST /api/WFEvent/showstage`
- `GET /api/PMRequisitionMaster/workFlowRights`
- `GET /api/pmPurchaseMaster/filterOrderType/0`

Observed response fields on the tracking list:

- `id`, `requisitionId`
- `type`
- `vesselName`, `vesselId`
- `requisitionNumber`
- `currentStatus`
- `originSite`
- `requisitionCreateDate`
- `description`
- `priority`
- `department`
- `category`
- `orderTypeId`
- `rfqId`, `rfqHeader`
- `poData`
- `assignee`

### Requisition Detail / Edit Screen

Reloading `RequisitionsNew/{id}` produced the clearest live requisition-detail endpoint set.

Primary record endpoint:

- `GET /api/PMRequisitionMaster/getRequisitionMasterById/{requisitionId}`

Observed example:

- `GET /api/PMRequisitionMaster/getRequisitionMasterById/17209`

Observed companion endpoints:

- `GET /api/UserManagement/accessrightbyurl/152/RequisitionsNew/Purchase`
- `GET /api/CategoryMaster/makers/0`
- `GET /api/pmPurchaseMaster/GetReqItemModifyColumn/152/ReqItem`
- `GET /api/UserManagement/filterDepartmentsEnvironment/17209`
- `GET /api/VesselManagement/vesselShort`
- `GET /api/pmPurchaseMaster/filterPreferenceType/0`
- `GET /api/unit/filter/0`
- `GET /api/UserManagement/User/152`
- `GET /api/PMRequisitionMaster/GetRequisitionLog/17209`
- `GET /api/WFEvent/GetWQTTarget/0`
- `GET /api/CategoryMaster/attachmentTypes/0`
- `GET /api/pmPurchaseMaster/getProjectNCForReq/0`
- `GET /api/PMRequisitionMaster/getPurchaseTemplates/203`
- `GET /api/WFEvent/usersByRole?url=RequisitionsNew&state=Open%20%26%20Start`
- `GET /api/pmPurchaseMaster/getattachment/0/Purchase%20Requisition/17209/tblPMRequisitions`
- `GET /api/PMRequisitionMaster/getDisplayCartItems?Ids=2588&VesselId=203`
- `GET /api/PMRequisitionMaster/getDisplayComponentItems?Ids=2588`
- `GET /api/PMRequisitionMaster/GetServiceTypeById/0/17209`
- `GET /api/WFEvent/GetWorkFlowTranisitions?Id=17209&Url=RequisitionsNew&State=Open%20%26%20Start&Page=Requisition`
- `GET /api/PMRequisitionMaster/getDeliveryInfoByReqId/17209`
- `GET /api/pmPurchaseMaster/filterOrderType/0`
- `GET /api/PMRequisitionMaster/componentTemplateTreeBySP/203`
- `GET /api/ShipMaster/filterCartItemsInfo/Service/203`
- `GET /api/pmPurchaseMaster/GetServiceModifyColumn/152/RequisitionService`

## What This Gives Us For The Product

This is enough to start wiring a real connector for:

- PMS maintenance forecast list
- PMS maintenance detail readout
- Purchase requisition tracking list
- Purchase requisition detail readout
- Purchase workflow log and transition visibility
- Purchase attachments, service info, and linked component/cart items

## Recommended Next Build Step

Use this inventory to implement connector methods for:

1. `listMaintenanceForecast(filters)`
2. `getMaintenanceForecastDetail(shipComponentJobLinkId)`
3. `listRequisitionTracking(filters)`
4. `getRequisitionById(requisitionId)`
5. `getRequisitionWorkflow(requisitionId)`
6. `getRequisitionDeliveryInfo(requisitionId)`

The next capture pass should target write actions:

- close / complete maintenance
- create defect
- create postponement request
- create requisition
- submit requisition workflow action
