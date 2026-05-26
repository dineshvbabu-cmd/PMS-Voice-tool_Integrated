"use strict";

const pmsRoutes = [
  "maintenanceForecast",
  "defect",
  "counterUpdate",
  "completedMaintenances",
  "InventoryExplorer",
  "FileExplorer",
  "certificateExplorer",
  "sep",
  "dashboard",
  "categoryDefectChart",
  "reasonDefectChart",
  "trendDefectChart",
  "Requisitionslist",
  "RequisitionsNew",
  "RequisitionTracking",
  "vesselMaterialList",
  "vesselMaterial",
  "materiallist",
  "MaterialReceiptNew",
  "RequisitionTemplates",
  "position",
  "locationMaster",
  "spareAssemblysList",
  "listShipPms",
  "counterMaster",
  "maintenanceMasterList",
  "sparePartsMaster",
  "shipMaintenanceProcedure",
  "shipMaintenanceReference",
  "pages",
  "roleBasedAccessRights",
  "userBasedAccessRights",
  "vesselCertificate",
  "certificateScheduler",
  "defectChartConfiguration",
  "spareAssembly",
  "classificationSurvey",
  "groupMaster",
  "listmaintenance",
  "component",
  "spareparts",
  "stores",
  "cause",
  "pmsTemplate",
  "pmssetup",
  "postponeConfigComponent",
  "jSAmaster",
  "componentSetUp"
];

const purchaseRouteGroups = [
  {
    category: "Purchase Link",
    routes: [
      "Rfqlist",
      "RequisitionsNew",
      "Requisitionslist",
      "InvoiceList",
      "createInvoice",
      "materiallist",
      "CreateDO",
      "QuotComparison",
      "PurchaseOrder",
      "CreditNotes",
      "vesselMaterialList",
      "RequisitionTracking"
    ]
  },
  {
    category: "Work Flow Master",
    routes: ["wfevent", "wfworkflow", "wfgroup", "nigerian-currency"]
  },
  {
    category: "Vendor Management",
    routes: ["VendorRegistration", "VendorDetails"]
  },
  {
    category: "Purchase Master",
    routes: [
      "ExceptionMaster",
      "Ordertype",
      "MaterialQuality",
      "ProjectName",
      "priority",
      "service-category",
      "servicetype",
      "AdditionalCost",
      "QualityMaster",
      "CompanyMasterlist",
      "email",
      "AttachmentType"
    ]
  }
];

const liveEndpoints = {
  pms: {
    read: [
      {
        key: "dueJobs",
        label: "Maintenance forecast list",
        method: "GET",
        path: "ShipMaster/shipMaintenanceDirectCompleteBySP",
        notes: "Captured from maintenanceForecast on May 26, 2026."
      },
      {
        key: "jobDetail",
        label: "Maintenance detail",
        method: "GET",
        path: "ShipMaster/shipMaintenanceForecastById/{jobId}",
        notes: "Triggered by clicking a maintenance row."
      },
      {
        key: "postponeJobs",
        label: "Postponement queue",
        method: "GET",
        path: "ShipMaster/postponeJobs",
        notes: "Captured from the Postpone Jobs tab on May 26, 2026."
      },
      {
        key: "vessels",
        label: "Vessel lookup",
        method: "GET",
        path: "VesselManagement/vessels/0",
        notes: "Used by filters and vessel selectors."
      }
    ],
    support: [
      "UserManagement/accessrightbyurl/{userId}/maintenanceForecast/PMS",
      "UserManagement/Users/0",
      "PMSGroup/causes/0",
      "CategoryMaster/filterPriority/0",
      "UserManagement/UserFleets/0/{userId}",
      "CategoryMaster/attachmentTypes/0"
    ]
  },
  purchase: {
    read: [
      {
        key: "tracking",
        label: "Requisition tracking list",
        method: "GET",
        path: "PMRequisitionMaster/purchaseTracksLists",
        notes: "Captured from RequisitionTracking on May 26, 2026."
      },
      {
        key: "requisitionDetail",
        label: "Requisition detail",
        method: "GET",
        path: "PMRequisitionMaster/getRequisitionMasterById/{requisitionId}",
        notes: "Captured from RequisitionsNew/{id}."
      },
      {
        key: "requisitionLog",
        label: "Requisition log",
        method: "GET",
        path: "PMRequisitionMaster/GetRequisitionLog/{requisitionId}",
        notes: "Workflow history for a requisition."
      },
      {
        key: "deliveryInfo",
        label: "Requisition delivery info",
        method: "GET",
        path: "PMRequisitionMaster/getDeliveryInfoByReqId/{requisitionId}",
        notes: "Linked delivery fields for requisition detail."
      }
    ],
    support: [
      "UserManagement/accessrightbyurlss/{userId}/Purchase",
      "UserManagement/accessrightbyurl/{userId}/RequisitionTracking/Purchase",
      "pmPurchaseMaster/GetRequisitionTrackModifyColumn/{userId}/Requisition Track",
      "WFEvent/showstage",
      "PMRequisitionMaster/workFlowRights"
    ]
  }
};

const samplePrompts = [
  "Show maintenance forecast for Woodstock due in the next 30 days.",
  "Read the maintenance detail for ship component job link 87196.",
  "Show postponed jobs awaiting approval for Alkebulan.",
  "List requisitions in PO SEND status for Alkebulan.",
  "Show the workflow log for requisition 17209.",
  "Prepare a closure draft for WO-24088 completed on 2026-05-26."
];

module.exports = {
  pmsRoutes,
  purchaseRouteGroups,
  liveEndpoints,
  samplePrompts
};
