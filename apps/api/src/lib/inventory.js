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
    write: [
      {
        key: "closeJob",
        label: "Maintenance completion submit",
        method: "POST",
        path: "ShipMaster/jobPlanDirectSubmit",
        notes: "Captured from the maintenance forecast completion modal on May 26, 2026."
      },
      {
        key: "postponeJob",
        label: "Maintenance postponement submit",
        method: "POST",
        path: "ShipMaster/postponeJob",
        notes: "Captured from the postpone jobs modal on May 26, 2026."
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
    write: [
      {
        key: "createRequisition",
        label: "Requisition create",
        method: "POST",
        path: "PMRequisitionMaster/addRequisitionMaster",
        notes: "Captured from the requisition save flow on May 26, 2026."
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
  "Show all overdue maintenances.",
  "Show critical overdue maintenances.",
  "Read the maintenance detail for ship component job link 82225.",
  "Show open overdue defects.",
  "Show critical defects coming due.",
  "Show certificates overdue.",
  "Show certificates due in 30 days.",
  "List requisitions in PO SEND status.",
  "Show purchase orders and material receipt status.",
  "Show requisition 17209 detail with workflow log and delivery info.",
  "Compare vendor quotes for any live requisition and recommend the best supplier.",
  "List spare inventory items for vessel Alkebulan.",
  "Find store items for vessel Alkebulan matching fuel pump.",
  "Create requisition for inventory item 2588 on vessel Alkebulan.",
  "Close ship component job link 82225 completed on 2026-05-26 with remarks valve checked satisfactory.",
  "Postpone ship component job link 82225 until 2026-06-10 with reason 5, approver 152, and remarks awaiting spares.",
  "Create requisition with payload {\"Requisition\":{\"vesselId\":203,\"description\":\"Class occasional survey service\"},\"items\":[],\"templateItems\":[],\"workflow\":\"1\"}."
];

module.exports = {
  pmsRoutes,
  purchaseRouteGroups,
  liveEndpoints,
  samplePrompts
};
