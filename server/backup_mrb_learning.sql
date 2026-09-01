-- MySQL dump 10.13  Distrib 8.0.46, for Linux (x86_64)
--
-- Host: localhost    Database: mrb_learning
-- ------------------------------------------------------
-- Server version	8.0.46-0ubuntu0.24.04.3

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `activity_logs`
--

DROP TABLE IF EXISTS `activity_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `activity_logs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` bigint DEFAULT NULL,
  `role` enum('admin','student','teacher','system') NOT NULL DEFAULT 'system',
  `action` varchar(255) NOT NULL,
  `entity_type` varchar(255) NOT NULL,
  `entity_id` varchar(255) DEFAULT NULL,
  `metadata_json` json DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_activity_logs_created_at` (`created_at`),
  KEY `idx_activity_logs_action_created_at` (`action`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `activity_logs`
--

LOCK TABLES `activity_logs` WRITE;
/*!40000 ALTER TABLE `activity_logs` DISABLE KEYS */;
/*!40000 ALTER TABLE `activity_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `auth_sessions`
--

DROP TABLE IF EXISTS `auth_sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `auth_sessions` (
  `id` char(36) NOT NULL,
  `user_id` bigint NOT NULL,
  `role_snapshot` varchar(32) NOT NULL,
  `jti` varchar(64) NOT NULL,
  `refresh_token_hash` char(64) NOT NULL,
  `previous_refresh_hash` char(64) DEFAULT NULL,
  `token_version_snapshot` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `last_used_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` datetime NOT NULL,
  `revoked_at` timestamp NULL DEFAULT NULL,
  `last_ip_hash` char(64) DEFAULT NULL,
  `ua_fingerprint` char(64) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_auth_sessions_jti` (`jti`),
  KEY `idx_auth_sessions_user_id` (`user_id`),
  KEY `idx_auth_sessions_expires_at` (`expires_at`),
  KEY `idx_auth_sessions_revoked_at` (`revoked_at`),
  CONSTRAINT `fk_auth_session_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `auth_sessions`
--

LOCK TABLES `auth_sessions` WRITE;
/*!40000 ALTER TABLE `auth_sessions` DISABLE KEYS */;
/*!40000 ALTER TABLE `auth_sessions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `cities`
--

DROP TABLE IF EXISTS `cities`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cities` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `province_id` bigint unsigned NOT NULL,
  `district_id` bigint unsigned NOT NULL,
  `name` varchar(120) NOT NULL,
  `slug` varchar(140) NOT NULL,
  `postal_code` varchar(20) DEFAULT NULL,
  `is_other_option` tinyint(1) NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cities_district_name` (`district_id`,`name`),
  UNIQUE KEY `uq_cities_district_slug` (`district_id`,`slug`),
  KEY `idx_cities_province` (`province_id`),
  KEY `idx_cities_district` (`district_id`),
  KEY `idx_cities_active` (`is_active`),
  KEY `idx_cities_sort` (`sort_order`),
  CONSTRAINT `fk_cities_district` FOREIGN KEY (`district_id`) REFERENCES `districts` (`id`),
  CONSTRAINT `fk_cities_province` FOREIGN KEY (`province_id`) REFERENCES `provinces` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=1079015 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `cities`
--

LOCK TABLES `cities` WRITE;
/*!40000 ALTER TABLE `cities` DISABLE KEYS */;
INSERT INTO `cities` VALUES (88,1,1,'Lahore','lahore',NULL,0,1,1,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(89,1,1,'Bahria Town Lahore','bahria-town-lahore',NULL,0,1,2,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(90,1,1,'DHA Lahore','dha-lahore',NULL,0,1,3,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(91,1,2,'Sheikhupura','sheikhupura',NULL,0,1,1,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(92,1,2,'Muridke','muridke',NULL,0,1,2,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(93,1,3,'Nankana Sahib','nankana-sahib',NULL,0,1,1,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(94,1,4,'Kasur','kasur',NULL,0,1,1,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(95,1,4,'Chunian','chunian',NULL,0,1,2,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(96,1,5,'Rawalpindi','rawalpindi',NULL,0,1,1,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(97,1,5,'Bahria Town Rawalpindi','bahria-town-rawalpindi',NULL,0,1,2,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(98,1,5,'Murree','murree',NULL,0,1,3,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(99,1,6,'Attock','attock',NULL,0,1,1,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(100,1,6,'Hazro','hazro',NULL,0,1,2,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(101,1,7,'Chakwal','chakwal',NULL,0,1,1,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(102,1,8,'Jhelum','jhelum',NULL,0,1,1,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(103,1,8,'Sohawa','sohawa',NULL,0,1,2,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(104,1,9,'Faisalabad','faisalabad',NULL,0,1,1,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(105,1,9,'Jaranwala','jaranwala',NULL,0,1,2,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(106,1,9,'Samundri','samundri',NULL,0,1,3,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(107,1,10,'Chiniot','chiniot',NULL,0,1,1,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(108,1,11,'Jhang','jhang',NULL,0,1,1,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(109,1,11,'Shorkot','shorkot',NULL,0,1,2,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(110,1,12,'Toba Tek Singh','toba-tek-singh',NULL,0,1,1,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(111,1,12,'Gojra','gojra',NULL,0,1,2,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(112,1,13,'Multan','multan',NULL,0,1,1,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(113,1,13,'Shujabad','shujabad',NULL,0,1,2,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(114,1,14,'Khanewal','khanewal',NULL,0,1,1,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(115,1,14,'Mian Channu','mian-channu',NULL,0,1,2,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(116,1,15,'Lodhran','lodhran',NULL,0,1,1,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(117,1,16,'Vehari','vehari',NULL,0,1,1,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(118,1,16,'Burewala','burewala',NULL,0,1,2,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(119,1,17,'Gujranwala','gujranwala',NULL,0,1,1,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(120,1,17,'Kamoke','kamoke',NULL,0,1,2,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(121,1,22,'Sialkot','sialkot',NULL,0,1,1,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(122,1,22,'Daska','daska',NULL,0,1,2,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(123,1,22,'Wazirabad','wazirabad',NULL,0,1,3,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(124,1,23,'Sargodha','sargodha',NULL,0,1,1,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(125,1,23,'Bhalwal','bhalwal',NULL,0,1,2,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(126,1,27,'Bahawalpur','bahawalpur',NULL,0,1,1,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(127,1,27,'Ahmadpur East','ahmadpur-east',NULL,0,1,2,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(128,1,29,'Rahim Yar Khan','rahim-yar-khan',NULL,0,1,1,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(129,1,29,'Sadiqabad','sadiqabad',NULL,0,1,2,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(130,2,44,'Karachi','karachi',NULL,0,1,1,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(131,2,44,'Clifton','clifton',NULL,0,1,2,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(132,2,44,'Saddar','saddar',NULL,0,1,3,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(133,2,41,'Gulshan-e-Iqbal','gulshan-e-iqbal',NULL,0,1,1,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(134,2,41,'Gulberg','gulberg',NULL,0,1,2,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(135,2,41,'North Nazimabad','north-nazimabad',NULL,0,1,3,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(136,2,45,'Malir','malir',NULL,0,1,1,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(137,2,45,'Bin Qasim','bin-qasim',NULL,0,1,2,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(138,2,47,'Hyderabad','hyderabad',NULL,0,1,1,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(139,2,47,'Qasimabad','qasimabad',NULL,0,1,2,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(140,2,47,'Latifabad','latifabad',NULL,0,1,3,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(141,2,51,'Sukkur','sukkur',NULL,0,1,1,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(142,2,53,'Khairpur','khairpur',NULL,0,1,1,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(143,2,53,'Kingri','kingri',NULL,0,1,2,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(144,2,54,'Larkana','larkana',NULL,0,1,1,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(145,2,55,'Jacobabad','jacobabad',NULL,0,1,1,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(146,2,57,'Shikarpur','shikarpur',NULL,0,1,1,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(147,3,67,'Peshawar','peshawar',NULL,0,1,1,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(148,3,67,'Hayatabad','hayatabad',NULL,0,1,2,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(149,3,67,'University Town','university-town',NULL,0,1,3,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(150,3,68,'Charsadda','charsadda',NULL,0,1,1,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(151,3,69,'Nowshera','nowshera',NULL,0,1,1,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(152,3,77,'Abbottabad','abbottabad',NULL,0,1,1,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(153,3,77,'Havelian','havelian',NULL,0,1,2,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(154,3,78,'Mansehra','mansehra',NULL,0,1,1,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(155,3,79,'Haripur','haripur',NULL,0,1,1,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(156,3,71,'Swat','swat',NULL,0,1,1,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(157,3,71,'Mingora','mingora',NULL,0,1,2,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(158,4,101,'Quetta','quetta',NULL,0,1,1,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(159,4,101,'Satellite Town Quetta','satellite-town-quetta',NULL,0,1,2,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(160,4,107,'Gwadar','gwadar',NULL,0,1,1,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(161,5,116,'Islamabad','islamabad',NULL,0,1,1,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(162,5,116,'F-6','f-6',NULL,0,1,2,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(163,5,116,'F-7','f-7',NULL,0,1,3,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(164,5,116,'F-8','f-8',NULL,0,1,4,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(165,5,116,'G-9','g-9',NULL,0,1,5,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(166,5,116,'G-10','g-10',NULL,0,1,6,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(167,5,116,'G-11','g-11',NULL,0,1,7,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(168,5,116,'Bahria Town Islamabad','bahria-town-islamabad',NULL,0,1,8,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(169,5,116,'DHA Islamabad','dha-islamabad',NULL,0,1,9,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(170,6,117,'Muzaffarabad','muzaffarabad',NULL,0,1,1,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(171,6,119,'Mirpur','mirpur',NULL,0,1,1,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(172,6,119,'New Mirpur City','new-mirpur-city',NULL,0,1,2,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(173,7,125,'Gilgit','gilgit',NULL,0,1,1,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(175,1,18,'Gujrat (Other)','gujrat-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(176,1,19,'Hafizabad (Other)','hafizabad-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(177,1,20,'Mandi Bahauddin (Other)','mandi-bahauddin-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(178,1,21,'Narowal (Other)','narowal-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(179,1,24,'Bhakkar (Other)','bhakkar-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(180,1,25,'Khushab (Other)','khushab-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(181,1,26,'Mianwali (Other)','mianwali-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(182,1,28,'Bahawalnagar (Other)','bahawalnagar-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(183,1,30,'Sahiwal (Other)','sahiwal-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(184,1,31,'Okara (Other)','okara-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(185,1,32,'Pakpattan (Other)','pakpattan-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(186,1,33,'DG Khan (Other)','dg-khan-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(187,1,34,'Layyah (Other)','layyah-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(188,1,35,'Muzaffargarh (Other)','muzaffargarh-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(189,1,36,'Rajanpur (Other)','rajanpur-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(190,1,37,'Gujrat (Other)','gujrat-d-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(191,1,38,'Kharian (Other)','kharian-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(192,2,39,'Karachi East (Other)','karachi-east-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(193,2,40,'Karachi West (Other)','karachi-west-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(194,2,42,'Karachi South (Other)','karachi-south-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(195,2,43,'Malir (Other)','malir-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(196,2,46,'Jamshoro (Other)','jamshoro-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(197,2,48,'Tando Allahyar (Other)','tando-allahyar-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(198,2,49,'Tando Muhammad Khan (Other)','tando-muhammad-khan-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(199,2,50,'Sukkur (Other)','sukkur-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(200,2,52,'Khairpur (Other)','khairpur-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(201,2,56,'Shikarpur (Other)','shikarpur-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(202,2,58,'Tharparkar (Other)','tharparkar-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(203,2,59,'Umerkot (Other)','umerkot-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(204,2,60,'Shaheed Benazirabad (Other)','shaheed-benazirabad-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(205,2,61,'Naushahro Feroze (Other)','naushahro-feroze-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(206,2,62,'Sanghar (Other)','sanghar-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(207,3,63,'Peshawar (Other)','peshawar-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(208,3,64,'Charsadda (Other)','charsadda-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(209,3,65,'Nowshera (Other)','nowshera-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(210,3,66,'Mardan (Other)','mardan-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(211,3,70,'Dir Lower (Other)','dir-lower-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(212,3,72,'Chitral (Other)','chitral-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(213,3,73,'Buner (Other)','buner-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(214,3,74,'Shangla (Other)','shangla-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(215,3,75,'Abbottabad (Other)','abbottabad-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(216,3,76,'Mansehra (Other)','mansehra-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(217,3,80,'Kohat (Other)','kohat-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(218,3,81,'Karak (Other)','karak-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(219,3,82,'Hangu (Other)','hangu-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(220,3,83,'Bannu (Other)','bannu-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(221,3,84,'Lakki Marwat (Other)','lakki-marwat-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(222,3,85,'North Waziristan (Other)','north-waziristan-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(223,3,86,'Dera Ismail Khan (Other)','dera-ismail-khan-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(224,3,87,'South Waziristan (Other)','south-waziristan-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(225,3,88,'Tank (Other)','tank-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(226,4,89,'Quetta (Other)','quetta-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(227,4,90,'Pishin (Other)','pishin-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(228,4,91,'Killa Abdullah (Other)','killa-abdullah-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(229,4,92,'Chagai (Other)','chagai-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(230,4,93,'Kalat (Other)','kalat-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(231,4,94,'Khuzdar (Other)','khuzdar-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(232,4,95,'Mastung (Other)','mastung-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(233,4,96,'Gwadar (Other)','gwadar-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(234,4,97,'Turbat (Other)','turbat-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(235,4,98,'Panjgur (Other)','panjgur-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(236,4,99,'Zhob (Other)','zhob-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(237,4,100,'Sherani (Other)','sherani-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(238,4,102,'Nasirabad (Other)','nasirabad-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(239,4,103,'Jaffarabad (Other)','jaffarabad-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(240,4,104,'Sohbatpur (Other)','sohbatpur-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(241,4,105,'Sibi (Other)','sibi-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(242,4,106,'Ziarat (Other)','ziarat-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(243,5,108,'Islamabad (Other)','islamabad-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(244,6,109,'Muzaffarabad (Other)','muzaffarabad-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(245,6,110,'Neelum (Other)','neelum-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(246,6,111,'Mirpur (Other)','mirpur-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(247,6,112,'Bhimber (Other)','bhimber-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(248,6,113,'Kotli (Other)','kotli-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(249,6,114,'Poonch (Other)','poonch-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(250,6,115,'Haveli (Other)','haveli-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(251,7,118,'Gilgit (Other)','gilgit-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(252,7,120,'Nagar (Other)','nagar-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(253,7,121,'Skardu (Other)','skardu-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(254,7,122,'Shigar (Other)','shigar-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(255,7,123,'Kharmang (Other)','kharmang-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(256,7,124,'Roundu (Other)','roundu-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(257,7,126,'Darel (Other)','darel-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16'),(258,7,127,'Tangir (Other)','tangir-city-fallback',NULL,1,1,9999,'2026-06-24 23:59:16','2026-06-24 23:59:16');
/*!40000 ALTER TABLE `cities` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `contact_remarks`
--

DROP TABLE IF EXISTS `contact_remarks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `contact_remarks` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `name` varchar(120) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `whatsapp` varchar(20) DEFAULT NULL,
  `message` text NOT NULL,
  `page_url` varchar(255) DEFAULT NULL,
  `status` enum('new','read') NOT NULL DEFAULT 'new',
  `posted` tinyint(1) NOT NULL DEFAULT '0',
  `posted_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_contact_remarks_status_created` (`status`,`created_at` DESC),
  KEY `idx_contact_remarks_created` (`created_at` DESC),
  KEY `idx_contact_remarks_posted` (`posted`,`posted_at` DESC),
  KEY `idx_contact_remarks_whatsapp_created` (`whatsapp`,`created_at` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `contact_remarks`
--

LOCK TABLES `contact_remarks` WRITE;
/*!40000 ALTER TABLE `contact_remarks` DISABLE KEYS */;
/*!40000 ALTER TABLE `contact_remarks` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `course_batches`
--

DROP TABLE IF EXISTS `course_batches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `course_batches` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `course_id` bigint NOT NULL,
  `title` varchar(180) NOT NULL,
  `code` varchar(120) NOT NULL,
  `start_date` datetime NOT NULL,
  `end_date` datetime NOT NULL,
  `enrollment_open_at` datetime NOT NULL COMMENT 'DEPRECATED: Use courses.admission_status instead',
  `enrollment_close_at` datetime NOT NULL COMMENT 'DEPRECATED: Use courses.admission_status instead',
  `total_seats` int NOT NULL,
  `seats_filled` int NOT NULL DEFAULT '0',
  `instructor_name` varchar(160) DEFAULT NULL,
  `schedule_label` varchar(180) DEFAULT NULL,
  `timezone` varchar(80) NOT NULL DEFAULT 'UTC',
  `status` varchar(40) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `allow_enrollment` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'DEPRECATED: Use courses.admission_status instead',
  `show_publicly` tinyint(1) NOT NULL DEFAULT '1',
  `certificate_enabled` tinyint(1) NOT NULL DEFAULT '0',
  `recordings_enabled` tinyint(1) NOT NULL DEFAULT '1',
  `sequential_lectures_enabled` tinyint(1) NOT NULL DEFAULT '0',
  `created_by` bigint DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_course_batch_course_code` (`course_id`,`code`),
  UNIQUE KEY `uq_course_batches_single_course` (`course_id`),
  KEY `fk_course_batches_created_by` (`created_by`),
  KEY `idx_course_batches_code` (`code`),
  KEY `idx_course_batches_course` (`course_id`),
  KEY `idx_course_batches_status` (`status`),
  KEY `idx_course_batches_active` (`course_id`,`is_active`),
  KEY `idx_course_batches_enrollment_window` (`enrollment_open_at`,`enrollment_close_at`),
  KEY `idx_course_batches_course_status` (`course_id`,`status`),
  CONSTRAINT `fk_course_batches_course` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_course_batches_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `course_batches`
--

LOCK TABLES `course_batches` WRITE;
/*!40000 ALTER TABLE `course_batches` DISABLE KEYS */;
/*!40000 ALTER TABLE `course_batches` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `course_drafts`
--

DROP TABLE IF EXISTS `course_drafts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `course_drafts` (
  `user_id` bigint NOT NULL,
  `draft_json` json NOT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  CONSTRAINT `fk_course_drafts_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `course_drafts`
--

LOCK TABLES `course_drafts` WRITE;
/*!40000 ALTER TABLE `course_drafts` DISABLE KEYS */;
/*!40000 ALTER TABLE `course_drafts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `course_field_mappings`
--

DROP TABLE IF EXISTS `course_field_mappings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `course_field_mappings` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `source_course_id` bigint DEFAULT NULL,
  `target_course_id` bigint DEFAULT NULL,
  `source_field` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `target_field` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `value_map_json` json DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_course_field_mapping` (`source_course_id`,`target_course_id`,`source_field`,`target_field`),
  KEY `idx_course_field_mappings_target` (`target_course_id`,`is_active`),
  CONSTRAINT `fk_cfm_source_course` FOREIGN KEY (`source_course_id`) REFERENCES `courses` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cfm_target_course` FOREIGN KEY (`target_course_id`) REFERENCES `courses` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `course_field_mappings`
--

LOCK TABLES `course_field_mappings` WRITE;
/*!40000 ALTER TABLE `course_field_mappings` DISABLE KEYS */;
/*!40000 ALTER TABLE `course_field_mappings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `course_pricing`
--

DROP TABLE IF EXISTS `course_pricing`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `course_pricing` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `course_id` bigint NOT NULL,
  `price_amount` int NOT NULL,
  `original_price_amount` int DEFAULT NULL,
  `currency_code` varchar(10) NOT NULL DEFAULT 'PKR',
  `pricing_type` enum('free','one_time','subscription') NOT NULL DEFAULT 'one_time',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `enrollment_visible` tinyint(1) NOT NULL DEFAULT '1',
  `public_purchase_visible` tinyint(1) NOT NULL DEFAULT '1',
  `starts_at` timestamp NULL DEFAULT NULL,
  `ends_at` timestamp NULL DEFAULT NULL,
  `created_by` bigint DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_course_pricing_created_by` (`created_by`),
  KEY `idx_course_pricing_course_active` (`course_id`,`is_active`),
  KEY `idx_course_pricing_course_window` (`course_id`,`starts_at`,`ends_at`),
  CONSTRAINT `fk_course_pricing_course` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_course_pricing_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `course_pricing`
--

LOCK TABLES `course_pricing` WRITE;
/*!40000 ALTER TABLE `course_pricing` DISABLE KEYS */;
/*!40000 ALTER TABLE `course_pricing` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `courses`
--

DROP TABLE IF EXISTS `courses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `courses` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `slug` varchar(180) DEFAULT NULL,
  `title` varchar(180) NOT NULL,
  `subject` varchar(80) DEFAULT NULL,
  `description` text NOT NULL,
  `short_description` varchar(512) DEFAULT NULL,
  `price` int NOT NULL DEFAULT '0',
  `original_price` int DEFAULT NULL,
  `accent_color` varchar(20) DEFAULT NULL,
  `level` varchar(60) DEFAULT NULL,
  `instructor` varchar(120) DEFAULT NULL,
  `batch_number` varchar(80) DEFAULT NULL,
  `image_url` varchar(1000) DEFAULT NULL,
  `lectures_count` varchar(20) DEFAULT '0',
  `tests_count` varchar(20) DEFAULT '0',
  `duration_weeks` int DEFAULT '0',
  `rating` decimal(3,2) DEFAULT '0.00',
  `students_enrolled` int DEFAULT '0',
  `is_active` tinyint(1) DEFAULT '1',
  `created_by` bigint DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `start_date` date DEFAULT NULL COMMENT 'Course start date',
  `end_date` date DEFAULT NULL COMMENT 'Course end date',
  `admission_status` enum('OPEN','CLOSED') NOT NULL DEFAULT 'CLOSED' COMMENT 'Admission status for enrollment',
  PRIMARY KEY (`id`),
  UNIQUE KEY `slug` (`slug`),
  KEY `idx_courses_admission_status` (`admission_status`),
  KEY `idx_courses_start_date` (`start_date`),
  KEY `idx_courses_end_date` (`end_date`),
  CONSTRAINT `chk_course_dates` CHECK (((`start_date` is null) or (`end_date` is null) or (`start_date` <= `end_date`)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `courses`
--

LOCK TABLES `courses` WRITE;
/*!40000 ALTER TABLE `courses` DISABLE KEYS */;
/*!40000 ALTER TABLE `courses` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `districts`
--

DROP TABLE IF EXISTS `districts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `districts` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `province_id` bigint unsigned NOT NULL,
  `name` varchar(120) NOT NULL,
  `slug` varchar(140) NOT NULL,
  `is_other_option` tinyint(1) NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_districts_province_slug` (`province_id`,`slug`),
  KEY `idx_districts_province` (`province_id`),
  KEY `idx_districts_active` (`is_active`),
  KEY `idx_districts_sort` (`sort_order`),
  CONSTRAINT `fk_districts_province` FOREIGN KEY (`province_id`) REFERENCES `provinces` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=1574928 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `districts`
--

LOCK TABLES `districts` WRITE;
/*!40000 ALTER TABLE `districts` DISABLE KEYS */;
INSERT INTO `districts` VALUES (1,1,'Lahore','lahore',0,1,1,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(2,1,'Sheikhupura','sheikhupura',0,1,2,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(3,1,'Nankana Sahib','nankana-sahib',0,1,3,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(4,1,'Kasur','kasur',0,1,4,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(5,1,'Rawalpindi','rawalpindi',0,1,1,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(6,1,'Attock','attock',0,1,2,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(7,1,'Chakwal','chakwal',0,1,3,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(8,1,'Jhelum','jhelum',0,1,4,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(9,1,'Faisalabad','faisalabad',0,1,1,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(10,1,'Chiniot','chiniot',0,1,2,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(11,1,'Jhang','jhang',0,1,3,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(12,1,'Toba Tek Singh','toba-tek-singh',0,1,4,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(13,1,'Multan','multan',0,1,1,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(14,1,'Khanewal','khanewal',0,1,2,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(15,1,'Lodhran','lodhran',0,1,3,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(16,1,'Vehari','vehari',0,1,4,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(17,1,'Gujranwala','gujranwala',0,1,1,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(18,1,'Gujrat','gujrat',0,1,2,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(19,1,'Hafizabad','hafizabad',0,1,3,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(20,1,'Mandi Bahauddin','mandi-bahauddin',0,1,4,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(21,1,'Narowal','narowal',0,1,5,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(22,1,'Sialkot','sialkot',0,1,6,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(23,1,'Sargodha','sargodha',0,1,1,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(24,1,'Bhakkar','bhakkar',0,1,2,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(25,1,'Khushab','khushab',0,1,3,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(26,1,'Mianwali','mianwali',0,1,4,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(27,1,'Bahawalpur','bahawalpur',0,1,1,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(28,1,'Bahawalnagar','bahawalnagar',0,1,2,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(29,1,'Rahim Yar Khan','rahim-yar-khan',0,1,3,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(30,1,'Sahiwal','sahiwal',0,1,1,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(31,1,'Okara','okara',0,1,2,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(32,1,'Pakpattan','pakpattan',0,1,3,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(33,1,'DG Khan','dg-khan',0,1,1,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(34,1,'Layyah','layyah',0,1,2,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(35,1,'Muzaffargarh','muzaffargarh',0,1,3,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(36,1,'Rajanpur','rajanpur',0,1,4,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(37,1,'Gujrat','gujrat-d',0,1,1,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(38,1,'Kharian','kharian',0,1,2,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(39,2,'Karachi East','karachi-east',0,1,1,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(40,2,'Karachi West','karachi-west',0,1,2,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(41,2,'Karachi Central','karachi-central',0,1,3,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(42,2,'Karachi South','karachi-south',0,1,4,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(43,2,'Malir','malir',0,1,5,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(44,2,'Korangi','korangi',0,1,6,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(45,2,'Hyderabad','hyderabad',0,1,1,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(46,2,'Jamshoro','jamshoro',0,1,2,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(47,2,'Matiari','matiari',0,1,3,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(48,2,'Tando Allahyar','tando-allahyar',0,1,4,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(49,2,'Tando Muhammad Khan','tando-muhammad-khan',0,1,5,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(50,2,'Sukkur','sukkur',0,1,1,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(51,2,'Ghotki','ghotki',0,1,2,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(52,2,'Khairpur','khairpur',0,1,3,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(53,2,'Larkana','larkana',0,1,1,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(54,2,'Jacobabad','jacobabad',0,1,2,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(55,2,'Kashmore','kashmore',0,1,3,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(56,2,'Shikarpur','shikarpur',0,1,4,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(57,2,'Mirpurkhas','mirpurkhas',0,1,1,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(58,2,'Tharparkar','tharparkar',0,1,2,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(59,2,'Umerkot','umerkot',0,1,3,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(60,2,'Shaheed Benazirabad','shaheed-benazirabad',0,1,1,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(61,2,'Naushahro Feroze','naushahro-feroze',0,1,2,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(62,2,'Sanghar','sanghar',0,1,3,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(63,3,'Peshawar','peshawar',0,1,1,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(64,3,'Charsadda','charsadda',0,1,2,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(65,3,'Nowshera','nowshera',0,1,3,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(66,3,'Mardan','mardan',0,1,1,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(67,3,'Swabi','swabi',0,1,2,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(68,3,'Malakand','malakand',0,1,1,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(69,3,'Swat','swat',0,1,2,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(70,3,'Dir Lower','dir-lower',0,1,3,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(71,3,'Dir Upper','dir-upper',0,1,4,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(72,3,'Chitral','chitral',0,1,5,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(73,3,'Buner','buner',0,1,6,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(74,3,'Shangla','shangla',0,1,7,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(75,3,'Abbottabad','abbottabad',0,1,1,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(76,3,'Mansehra','mansehra',0,1,2,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(77,3,'Haripur','haripur',0,1,3,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(78,3,'Battagram','battagram',0,1,4,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(79,3,'Kohistan','kohistan',0,1,5,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(80,3,'Kohat','kohat',0,1,1,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(81,3,'Karak','karak',0,1,2,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(82,3,'Hangu','hangu',0,1,3,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(83,3,'Bannu','bannu',0,1,1,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(84,3,'Lakki Marwat','lakki-marwat',0,1,2,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(85,3,'North Waziristan','north-waziristan',0,1,3,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(86,3,'Dera Ismail Khan','dera-ismail-khan',0,1,1,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(87,3,'South Waziristan','south-waziristan',0,1,2,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(88,3,'Tank','tank',0,1,3,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(89,4,'Quetta','quetta',0,1,1,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(90,4,'Pishin','pishin',0,1,2,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(91,4,'Killa Abdullah','killa-abdullah',0,1,3,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(92,4,'Chagai','chagai',0,1,4,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(93,4,'Kalat','kalat',0,1,1,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(94,4,'Khuzdar','khuzdar',0,1,2,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(95,4,'Mastung','mastung',0,1,3,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(96,4,'Gwadar','gwadar',0,1,1,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(97,4,'Turbat','turbat',0,1,2,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(98,4,'Panjgur','panjgur',0,1,3,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(99,4,'Zhob','zhob',0,1,1,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(100,4,'Sherani','sherani',0,1,2,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(101,4,'Musakhel','musakhel',0,1,3,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(102,4,'Nasirabad','nasirabad',0,1,1,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(103,4,'Jaffarabad','jaffarabad',0,1,2,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(104,4,'Sohbatpur','sohbatpur',0,1,3,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(105,4,'Sibi','sibi',0,1,1,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(106,4,'Ziarat','ziarat',0,1,2,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(107,4,'Harnai','harnai',0,1,3,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(108,5,'Islamabad','islamabad',0,1,1,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(109,6,'Muzaffarabad','muzaffarabad',0,1,1,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(110,6,'Neelum','neelum',0,1,2,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(111,6,'Mirpur','mirpur',0,1,1,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(112,6,'Bhimber','bhimber',0,1,2,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(113,6,'Kotli','kotli',0,1,3,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(114,6,'Poonch','poonch',0,1,1,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(115,6,'Haveli','haveli',0,1,2,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(116,6,'Bagh','bagh',0,1,3,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(117,6,'Sudhnoti','sudhnoti',0,1,4,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(118,7,'Gilgit','gilgit',0,1,1,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(119,7,'Hunza','hunza',0,1,2,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(120,7,'Nagar','nagar',0,1,3,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(121,7,'Skardu','skardu',0,1,1,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(122,7,'Shigar','shigar',0,1,2,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(123,7,'Kharmang','kharmang',0,1,3,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(124,7,'Roundu','roundu',0,1,4,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(125,7,'Diamer','diamer',0,1,1,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(126,7,'Darel','darel',0,1,2,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(127,7,'Tangir','tangir',0,1,3,'2026-06-24 23:47:21','2026-06-24 23:47:21');
/*!40000 ALTER TABLE `districts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `email_delivery_dlq`
--

DROP TABLE IF EXISTS `email_delivery_dlq`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `email_delivery_dlq` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `outbox_id` bigint DEFAULT NULL,
  `recipient_email` varchar(255) NOT NULL,
  `reason` varchar(255) NOT NULL,
  `payload_json` json DEFAULT NULL,
  `failed_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_email_delivery_dlq_failed_at` (`failed_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `email_delivery_dlq`
--

LOCK TABLES `email_delivery_dlq` WRITE;
/*!40000 ALTER TABLE `email_delivery_dlq` DISABLE KEYS */;
/*!40000 ALTER TABLE `email_delivery_dlq` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `email_outbox`
--

DROP TABLE IF EXISTS `email_outbox`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `email_outbox` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` bigint DEFAULT NULL,
  `template` varchar(120) NOT NULL,
  `recipient_email` varchar(255) NOT NULL,
  `payload_json` json DEFAULT NULL,
  `status` enum('queued','processing','sent','failed','dlq') NOT NULL DEFAULT 'queued',
  `attempts` int NOT NULL DEFAULT '0',
  `last_error` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_email_outbox_status_created` (`status`,`created_at`),
  KEY `idx_email_outbox_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `email_outbox`
--

LOCK TABLES `email_outbox` WRITE;
/*!40000 ALTER TABLE `email_outbox` DISABLE KEYS */;
/*!40000 ALTER TABLE `email_outbox` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `email_suppressions`
--

DROP TABLE IF EXISTS `email_suppressions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `email_suppressions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `email` varchar(255) NOT NULL,
  `reason` varchar(255) NOT NULL,
  `source` varchar(120) NOT NULL DEFAULT 'system',
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_email_suppressions_email` (`email`),
  KEY `idx_email_suppressions_active` (`active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `email_suppressions`
--

LOCK TABLES `email_suppressions` WRITE;
/*!40000 ALTER TABLE `email_suppressions` DISABLE KEYS */;
/*!40000 ALTER TABLE `email_suppressions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `email_verifications`
--

DROP TABLE IF EXISTS `email_verifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `email_verifications` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` bigint NOT NULL,
  `token_hash` char(64) NOT NULL,
  `expires_at` datetime NOT NULL,
  `used_at` timestamp NULL DEFAULT NULL,
  `issued_ip` varchar(64) DEFAULT NULL,
  `issued_user_agent` varchar(300) DEFAULT NULL,
  `verified_ip` varchar(64) DEFAULT NULL,
  `verified_user_agent` varchar(300) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_email_verifications_token_hash` (`token_hash`),
  KEY `idx_email_verifications_verify_lookup` (`token_hash`,`used_at`,`expires_at`),
  KEY `idx_email_verifications_user_id` (`user_id`),
  KEY `idx_email_verifications_expires_at` (`expires_at`),
  CONSTRAINT `fk_email_verifications_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `email_verifications`
--

LOCK TABLES `email_verifications` WRITE;
/*!40000 ALTER TABLE `email_verifications` DISABLE KEYS */;
/*!40000 ALTER TABLE `email_verifications` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `enrollments`
--

DROP TABLE IF EXISTS `enrollments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `enrollments` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint NOT NULL,
  `course_id` bigint NOT NULL,
  `order_id` bigint unsigned DEFAULT NULL,
  `applicant_full_name` varchar(160) NOT NULL,
  `father_name` varchar(160) NOT NULL,
  `date_of_birth` date DEFAULT NULL,
  `gender` enum('male','female') NOT NULL,
  `whatsapp_number` varchar(20) NOT NULL,
  `email` varchar(255) NOT NULL,
  `province_id` bigint unsigned NOT NULL,
  `district_id` bigint unsigned NOT NULL,
  `city_id` bigint unsigned NOT NULL,
  `board_id` bigint unsigned DEFAULT NULL,
  `hssc_status` enum('Inter Class','First Year Class','Matric Class') NOT NULL,
  `mdcat_attempt_type` enum('Fresher','Improver') NOT NULL,
  `status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `access_status` enum('active','inactive','revoked') NOT NULL DEFAULT 'inactive',
  `active_user_id` bigint GENERATED ALWAYS AS (if((`access_status` = _utf8mb4'active'),`user_id`,NULL)) VIRTUAL,
  `enrollment_source` enum('free','paid') DEFAULT NULL,
  `admin_note` varchar(500) DEFAULT NULL,
  `reviewed_by` bigint DEFAULT NULL,
  `reviewed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `switch_confirmed_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_enrollments_user_course` (`user_id`,`course_id`),
  UNIQUE KEY `uq_enrollments_one_active_per_user` (`active_user_id`),
  KEY `fk_enrollments_reviewed_by` (`reviewed_by`),
  KEY `idx_enrollments_user` (`user_id`),
  KEY `idx_enrollments_course` (`course_id`),
  KEY `idx_enrollments_order` (`order_id`),
  KEY `idx_enrollments_status` (`status`),
  KEY `idx_enrollments_user_access` (`user_id`,`access_status`),
  KEY `idx_enrollments_province_id` (`province_id`),
  KEY `idx_enrollments_district_id` (`district_id`),
  KEY `idx_enrollments_city_id` (`city_id`),
  KEY `idx_enrollments_board` (`board_id`),
  KEY `idx_enrollments_user_course_access` (`user_id`,`course_id`,`access_status`),
  CONSTRAINT `fk_enrollments_board` FOREIGN KEY (`board_id`) REFERENCES `intermediate_boards` (`id`),
  CONSTRAINT `fk_enrollments_city` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`),
  CONSTRAINT `fk_enrollments_course` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`),
  CONSTRAINT `fk_enrollments_district` FOREIGN KEY (`district_id`) REFERENCES `districts` (`id`),
  CONSTRAINT `fk_enrollments_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_enrollments_province` FOREIGN KEY (`province_id`) REFERENCES `provinces` (`id`),
  CONSTRAINT `fk_enrollments_reviewed_by` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_enrollments_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `enrollments`
--

LOCK TABLES `enrollments` WRITE;
/*!40000 ALTER TABLE `enrollments` DISABLE KEYS */;
/*!40000 ALTER TABLE `enrollments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `export_logs`
--

DROP TABLE IF EXISTS `export_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `export_logs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `export_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` bigint NOT NULL,
  `test_id` bigint NOT NULL,
  `format` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'xlsx',
  `total_rows_exported` int NOT NULL DEFAULT '0',
  `started_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completed_at` timestamp NULL DEFAULT NULL,
  `status` enum('started','completed','failed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'started',
  `error_message` text COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  KEY `idx_export_logs_user` (`user_id`),
  KEY `idx_export_logs_test` (`test_id`),
  KEY `idx_export_logs_status` (`status`),
  KEY `idx_export_logs_created` (`started_at`),
  CONSTRAINT `fk_export_logs_test` FOREIGN KEY (`test_id`) REFERENCES `tests` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_export_logs_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `export_logs`
--

LOCK TABLES `export_logs` WRITE;
/*!40000 ALTER TABLE `export_logs` DISABLE KEYS */;
/*!40000 ALTER TABLE `export_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `idempotency_keys`
--

DROP TABLE IF EXISTS `idempotency_keys`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `idempotency_keys` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `idempotency_key` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `request_hash` char(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status_code` int NOT NULL,
  `response_body` json NOT NULL,
  `user_id` bigint DEFAULT NULL,
  `endpoint` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `method` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_idempotency_key` (`idempotency_key`),
  KEY `idx_idempotency_expires` (`expires_at`),
  KEY `idx_idempotency_user` (`user_id`),
  KEY `idx_idempotency_created` (`created_at`),
  CONSTRAINT `fk_idempotency_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `idempotency_keys`
--

LOCK TABLES `idempotency_keys` WRITE;
/*!40000 ALTER TABLE `idempotency_keys` DISABLE KEYS */;
/*!40000 ALTER TABLE `idempotency_keys` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `intermediate_boards`
--

DROP TABLE IF EXISTS `intermediate_boards`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `intermediate_boards` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(190) NOT NULL,
  `slug` varchar(220) NOT NULL,
  `short_name` varchar(80) DEFAULT NULL,
  `is_other_option` tinyint(1) NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_intermediate_boards_name` (`name`),
  UNIQUE KEY `uq_intermediate_boards_slug` (`slug`),
  KEY `idx_intermediate_boards_active` (`is_active`),
  KEY `idx_intermediate_boards_sort` (`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `intermediate_boards`
--

LOCK TABLES `intermediate_boards` WRITE;
/*!40000 ALTER TABLE `intermediate_boards` DISABLE KEYS */;
/*!40000 ALTER TABLE `intermediate_boards` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `lecture_progress`
--

DROP TABLE IF EXISTS `lecture_progress`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lecture_progress` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint NOT NULL,
  `lecture_id` bigint NOT NULL,
  `course_id` bigint NOT NULL,
  `status` enum('completed') NOT NULL DEFAULT 'completed',
  `completed_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_lecture_progress_user_lecture` (`user_id`,`lecture_id`),
  KEY `fk_lecture_progress_lecture` (`lecture_id`),
  KEY `idx_lecture_progress_user_course` (`user_id`,`course_id`),
  KEY `idx_lecture_progress_course` (`course_id`),
  CONSTRAINT `fk_lecture_progress_course` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_lecture_progress_lecture` FOREIGN KEY (`lecture_id`) REFERENCES `lectures` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_lecture_progress_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `lecture_progress`
--

LOCK TABLES `lecture_progress` WRITE;
/*!40000 ALTER TABLE `lecture_progress` DISABLE KEYS */;
/*!40000 ALTER TABLE `lecture_progress` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `lectures`
--

DROP TABLE IF EXISTS `lectures`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lectures` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `course_id` bigint NOT NULL,
  `title` varchar(220) NOT NULL,
  `youtube_url` varchar(500) NOT NULL,
  `youtube_video_id` varchar(50) NOT NULL,
  `topic` varchar(120) DEFAULT NULL,
  `sort_order` int DEFAULT '0',
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_lectures_course` (`course_id`),
  CONSTRAINT `fk_lectures_course` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `lectures`
--

LOCK TABLES `lectures` WRITE;
/*!40000 ALTER TABLE `lectures` DISABLE KEYS */;
/*!40000 ALTER TABLE `lectures` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `orders`
--

DROP TABLE IF EXISTS `orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `orders` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint NOT NULL,
  `course_id` bigint NOT NULL,
  `enrollment_id` bigint unsigned DEFAULT NULL,
  `gateway` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'safepay',
  `gateway_order_ref` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `amount` int NOT NULL,
  `currency` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PKR',
  `status` enum('pending','paid','failed','cancelled','refunded') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `cancellation_reason` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cancelled_at` timestamp NULL DEFAULT NULL,
  `pending_enrollment_id` bigint unsigned GENERATED ALWAYS AS (if((`status` = _utf8mb4'pending'),`enrollment_id`,NULL)) VIRTUAL,
  `safepay_token` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `safepay_tracker` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `safepay_transaction_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `gateway_payload_json` json DEFAULT NULL,
  `paid_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_orders_gateway_order_ref` (`gateway_order_ref`),
  UNIQUE KEY `uq_orders_one_pending_per_enrollment` (`pending_enrollment_id`),
  KEY `idx_orders_user` (`user_id`),
  KEY `idx_orders_course` (`course_id`),
  KEY `idx_orders_enrollment` (`enrollment_id`),
  KEY `idx_orders_status` (`status`),
  KEY `idx_orders_safepay_token` (`safepay_token`),
  KEY `idx_orders_enrollment_status` (`enrollment_id`,`status`),
  CONSTRAINT `fk_orders_course` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`),
  CONSTRAINT `fk_orders_enrollment` FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_orders_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `orders`
--

LOCK TABLES `orders` WRITE;
/*!40000 ALTER TABLE `orders` DISABLE KEYS */;
/*!40000 ALTER TABLE `orders` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `processed_webhooks`
--

DROP TABLE IF EXISTS `processed_webhooks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `processed_webhooks` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `webhook_hash` char(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_processed_webhooks_hash` (`webhook_hash`),
  KEY `idx_processed_webhooks_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `processed_webhooks`
--

LOCK TABLES `processed_webhooks` WRITE;
/*!40000 ALTER TABLE `processed_webhooks` DISABLE KEYS */;
/*!40000 ALTER TABLE `processed_webhooks` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `provinces`
--

DROP TABLE IF EXISTS `provinces`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `provinces` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(120) NOT NULL,
  `slug` varchar(140) NOT NULL,
  `is_other_option` tinyint(1) NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_provinces_name` (`name`),
  UNIQUE KEY `uq_provinces_slug` (`slug`),
  KEY `idx_provinces_active` (`is_active`),
  KEY `idx_provinces_sort` (`sort_order`)
) ENGINE=InnoDB AUTO_INCREMENT=99209 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `provinces`
--

LOCK TABLES `provinces` WRITE;
/*!40000 ALTER TABLE `provinces` DISABLE KEYS */;
INSERT INTO `provinces` VALUES (1,'Punjab','punjab',0,1,1,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(2,'Sindh','sindh',0,1,2,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(3,'Khyber Pakhtunkhwa','khyber-pakhtunkhwa',0,1,3,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(4,'Balochistan','balochistan',0,1,4,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(5,'Islamabad Capital Territory','islamabad-capital-territory',0,1,5,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(6,'Azad Jammu & Kashmir','azad-jammu-kashmir',0,1,6,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(7,'Gilgit-Baltistan','gilgit-baltistan',0,1,7,'2026-06-24 23:47:21','2026-06-24 23:47:21'),(8,'Other','other',1,1,8,'2026-06-24 23:47:21','2026-06-24 23:47:21');
/*!40000 ALTER TABLE `provinces` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `review_audit_log`
--

DROP TABLE IF EXISTS `review_audit_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `review_audit_log` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `review_id` bigint NOT NULL,
  `admin_id` bigint DEFAULT NULL,
  `admin_name` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `action` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `previous_status` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `new_status` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `note` text COLLATE utf8mb4_unicode_ci,
  `metadata_json` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_review_audit_admin` (`admin_id`),
  KEY `idx_review_audit_review_created` (`review_id`,`created_at` DESC),
  KEY `idx_review_audit_action_created` (`action`,`created_at` DESC),
  CONSTRAINT `fk_review_audit_admin` FOREIGN KEY (`admin_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_review_audit_review` FOREIGN KEY (`review_id`) REFERENCES `reviews` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `review_audit_log`
--

LOCK TABLES `review_audit_log` WRITE;
/*!40000 ALTER TABLE `review_audit_log` DISABLE KEYS */;
/*!40000 ALTER TABLE `review_audit_log` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `reviews`
--

DROP TABLE IF EXISTS `reviews`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `reviews` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `uuid` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `course_name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rating` tinyint unsigned NOT NULL,
  `review_message` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('PENDING','APPROVED','REJECTED','ARCHIVED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `featured` tinyint(1) NOT NULL DEFAULT '0',
  `published` tinyint(1) NOT NULL DEFAULT '0',
  `published_at` timestamp NULL DEFAULT NULL,
  `admin_notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `approved_by_admin_id` bigint DEFAULT NULL,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_agent` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_reviews_uuid` (`uuid`),
  KEY `fk_reviews_approved_by` (`approved_by_admin_id`),
  KEY `idx_reviews_status` (`status`),
  KEY `idx_reviews_featured` (`featured`),
  KEY `idx_reviews_published` (`published`),
  KEY `idx_reviews_created_at` (`created_at`),
  KEY `idx_reviews_published_list` (`published`,`status`,`featured`,`created_at` DESC),
  KEY `idx_reviews_phone_created` (`phone`,`created_at`),
  KEY `idx_reviews_ip_created` (`ip_address`,`created_at`),
  CONSTRAINT `fk_reviews_approved_by` FOREIGN KEY (`approved_by_admin_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `chk_reviews_rating` CHECK ((`rating` between 1 and 5))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `reviews`
--

LOCK TABLES `reviews` WRITE;
/*!40000 ALTER TABLE `reviews` DISABLE KEYS */;
/*!40000 ALTER TABLE `reviews` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `student_questions`
--

DROP TABLE IF EXISTS `student_questions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `student_questions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` bigint NOT NULL,
  `subject` varchar(32) NOT NULL,
  `title` varchar(220) NOT NULL,
  `body` text NOT NULL,
  `attachment_url` varchar(1000) DEFAULT NULL,
  `answer` text,
  `status` enum('pending','answered') NOT NULL DEFAULT 'pending',
  `answered_by` bigint DEFAULT NULL,
  `answered_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `course_id` bigint DEFAULT NULL,
  `subject_id` bigint DEFAULT NULL,
  `assigned_teacher_id` bigint DEFAULT NULL,
  `seen_at` timestamp NULL DEFAULT NULL,
  `audio_url` varchar(1000) DEFAULT NULL,
  `answer_attachment_url` varchar(1000) DEFAULT NULL,
  `answer_audio_url` varchar(1000) DEFAULT NULL,
  `teacher_pinned_at` timestamp NULL DEFAULT NULL,
  `teacher_thread_ref` varchar(22) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_student_questions_answered_by` (`answered_by`),
  KEY `idx_student_questions_user_created` (`user_id`,`created_at` DESC),
  KEY `idx_student_questions_status_subject` (`status`,`subject`),
  KEY `idx_student_questions_updated` (`updated_at` DESC),
  KEY `idx_sq_course_subject_status` (`course_id`,`subject_id`,`status`),
  KEY `idx_sq_teacher_inbox` (`assigned_teacher_id`,`status`,`updated_at`),
  KEY `idx_sq_teacher_thread_ref` (`assigned_teacher_id`,`teacher_thread_ref`),
  KEY `idx_sq_teacher_user_updated` (`assigned_teacher_id`,`user_id`,`updated_at`),
  CONSTRAINT `fk_student_questions_answered_by` FOREIGN KEY (`answered_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_student_questions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `student_questions`
--

LOCK TABLES `student_questions` WRITE;
/*!40000 ALTER TABLE `student_questions` DISABLE KEYS */;
/*!40000 ALTER TABLE `student_questions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `subjects`
--

DROP TABLE IF EXISTS `subjects`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `subjects` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `course_id` bigint NOT NULL,
  `title` varchar(180) NOT NULL,
  `description` text,
  `order_index` int NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_subjects_course` (`course_id`),
  KEY `idx_subjects_course_order` (`course_id`,`order_index`),
  KEY `idx_subjects_course_active` (`course_id`,`is_active`),
  CONSTRAINT `fk_subjects_course` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `subjects`
--

LOCK TABLES `subjects` WRITE;
/*!40000 ALTER TABLE `subjects` DISABLE KEYS */;
/*!40000 ALTER TABLE `subjects` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `teacher_activity_logs`
--

DROP TABLE IF EXISTS `teacher_activity_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `teacher_activity_logs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `teacher_id` bigint NOT NULL,
  `question_id` bigint DEFAULT NULL,
  `action_type` enum('QUESTION_VIEWED','QUESTION_ANSWERED','ANSWER_UPDATED','LOGIN','LOGOUT') COLLATE utf8mb4_unicode_ci NOT NULL,
  `metadata_json` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tal_teacher_id` (`teacher_id`),
  KEY `idx_tal_action_type` (`action_type`),
  KEY `idx_tal_created_at` (`created_at`),
  KEY `idx_tal_teacher_action_created` (`teacher_id`,`action_type`,`created_at` DESC),
  KEY `idx_tal_question_id` (`question_id`),
  KEY `idx_tal_teacher_created` (`teacher_id`,`created_at` DESC),
  CONSTRAINT `fk_tal_question_id` FOREIGN KEY (`question_id`) REFERENCES `student_questions` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_tal_teacher_id` FOREIGN KEY (`teacher_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `teacher_activity_logs`
--

LOCK TABLES `teacher_activity_logs` WRITE;
/*!40000 ALTER TABLE `teacher_activity_logs` DISABLE KEYS */;
/*!40000 ALTER TABLE `teacher_activity_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `teacher_answers`
--

DROP TABLE IF EXISTS `teacher_answers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `teacher_answers` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `question_id` bigint NOT NULL,
  `teacher_id` bigint NOT NULL,
  `answer` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `answer_attachment_url` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `answer_audio_url` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ta_question_id` (`question_id`),
  KEY `idx_ta_teacher_id` (`teacher_id`),
  KEY `idx_ta_teacher_created` (`teacher_id`,`created_at` DESC),
  KEY `idx_ta_question_created` (`question_id`,`created_at` DESC),
  CONSTRAINT `fk_ta_question_id` FOREIGN KEY (`question_id`) REFERENCES `student_questions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_ta_teacher_id` FOREIGN KEY (`teacher_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `teacher_answers`
--

LOCK TABLES `teacher_answers` WRITE;
/*!40000 ALTER TABLE `teacher_answers` DISABLE KEYS */;
/*!40000 ALTER TABLE `teacher_answers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `teacher_subjects`
--

DROP TABLE IF EXISTS `teacher_subjects`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `teacher_subjects` (
  `teacher_id` bigint NOT NULL,
  `subject_id` bigint NOT NULL,
  `assigned_by` bigint DEFAULT NULL,
  `assigned_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`teacher_id`,`subject_id`),
  KEY `idx_teacher_subjects_subject` (`subject_id`),
  KEY `idx_teacher_subjects_assigned_by` (`assigned_by`),
  CONSTRAINT `fk_teacher_subjects_assigned_by` FOREIGN KEY (`assigned_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_teacher_subjects_subject` FOREIGN KEY (`subject_id`) REFERENCES `subjects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_teacher_subjects_teacher` FOREIGN KEY (`teacher_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `teacher_subjects`
--

LOCK TABLES `teacher_subjects` WRITE;
/*!40000 ALTER TABLE `teacher_subjects` DISABLE KEYS */;
/*!40000 ALTER TABLE `teacher_subjects` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `test_attempt_answers`
--

DROP TABLE IF EXISTS `test_attempt_answers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `test_attempt_answers` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `attempt_id` bigint NOT NULL,
  `question_id` bigint NOT NULL,
  `selected_option` varchar(10) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_attempt_question` (`attempt_id`,`question_id`),
  KEY `fk_attempt_answer_question` (`question_id`),
  CONSTRAINT `fk_attempt_answer_attempt` FOREIGN KEY (`attempt_id`) REFERENCES `test_attempts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_attempt_answer_question` FOREIGN KEY (`question_id`) REFERENCES `test_questions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `test_attempt_answers`
--

LOCK TABLES `test_attempt_answers` WRITE;
/*!40000 ALTER TABLE `test_attempt_answers` DISABLE KEYS */;
/*!40000 ALTER TABLE `test_attempt_answers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `test_attempts`
--

DROP TABLE IF EXISTS `test_attempts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `test_attempts` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `test_id` bigint NOT NULL,
  `user_id` bigint DEFAULT NULL,
  `student_name` varchar(120) DEFAULT NULL,
  `access_code_label` varchar(50) DEFAULT NULL,
  `used_code_hash` varchar(255) DEFAULT NULL,
  `status` enum('in_progress','submitted','expired') DEFAULT 'in_progress',
  `started_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` datetime NOT NULL,
  `submitted_at` datetime DEFAULT NULL,
  `completion_reason` varchar(50) DEFAULT NULL,
  `last_activity_at` datetime DEFAULT NULL,
  `ip_address` varchar(64) DEFAULT NULL,
  `user_agent` varchar(300) DEFAULT NULL,
  `device_fingerprint` varchar(128) DEFAULT NULL,
  `attempt_nonce` varchar(120) NOT NULL,
  `delivery_layout_json` json DEFAULT NULL,
  `result_id` bigint DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_test_attempts_test_student_status` (`test_id`,`user_id`,`status`),
  KEY `idx_test_attempts_user_status` (`user_id`,`status`),
  CONSTRAINT `fk_attempt_test` FOREIGN KEY (`test_id`) REFERENCES `tests` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_attempt_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `test_attempts`
--

LOCK TABLES `test_attempts` WRITE;
/*!40000 ALTER TABLE `test_attempts` DISABLE KEYS */;
/*!40000 ALTER TABLE `test_attempts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `test_export_batches`
--

DROP TABLE IF EXISTS `test_export_batches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `test_export_batches` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `exported_by` bigint NOT NULL,
  `test_id` bigint NOT NULL,
  `course_id` bigint NOT NULL,
  `format` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'json',
  `file_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `question_count` int NOT NULL DEFAULT '0',
  `image_count` int NOT NULL DEFAULT '0',
  `status` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'COMPLETED',
  `error_code` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `error_message` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `processing_time_ms` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_test_export_batches_user` (`exported_by`),
  KEY `idx_test_export_batches_test` (`test_id`),
  KEY `idx_test_export_batches_course` (`course_id`),
  KEY `idx_test_export_batches_status` (`status`),
  KEY `idx_test_export_batches_created` (`created_at`),
  CONSTRAINT `fk_test_export_batches_course` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_test_export_batches_test` FOREIGN KEY (`test_id`) REFERENCES `tests` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_test_export_batches_user` FOREIGN KEY (`exported_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_test_export_batch_status` CHECK ((`status` in (_utf8mb4'COMPLETED',_utf8mb4'FAILED')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `test_export_batches`
--

LOCK TABLES `test_export_batches` WRITE;
/*!40000 ALTER TABLE `test_export_batches` DISABLE KEYS */;
/*!40000 ALTER TABLE `test_export_batches` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `test_import_batches`
--

DROP TABLE IF EXISTS `test_import_batches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `test_import_batches` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `uploaded_by` bigint NOT NULL,
  `source_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'rich_json',
  `format` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `file_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `target_course_id` bigint NOT NULL,
  `target_test_id` bigint DEFAULT NULL,
  `total_questions` int NOT NULL DEFAULT '0',
  `image_count` int NOT NULL DEFAULT '0',
  `validation_error_count` int NOT NULL DEFAULT '0',
  `status` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `error_code` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `error_message` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `processing_time_ms` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_test_import_batches_uploaded_by` (`uploaded_by`),
  KEY `idx_test_import_batches_course` (`target_course_id`),
  KEY `idx_test_import_batches_test` (`target_test_id`),
  KEY `idx_test_import_batches_status` (`status`),
  CONSTRAINT `fk_test_import_batches_course` FOREIGN KEY (`target_course_id`) REFERENCES `courses` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_test_import_batches_test` FOREIGN KEY (`target_test_id`) REFERENCES `tests` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_test_import_batches_user` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_test_import_batch_status` CHECK ((`status` in (_utf8mb4'PENDING',_utf8mb4'COMPLETED',_utf8mb4'FAILED')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `test_import_batches`
--

LOCK TABLES `test_import_batches` WRITE;
/*!40000 ALTER TABLE `test_import_batches` DISABLE KEYS */;
/*!40000 ALTER TABLE `test_import_batches` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `test_questions`
--

DROP TABLE IF EXISTS `test_questions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `test_questions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `test_id` bigint NOT NULL,
  `question_text` text NOT NULL,
  `question_image_url` varchar(1000) DEFAULT NULL,
  `options_json` json NOT NULL,
  `correct_option` varchar(10) NOT NULL,
  `explanation` text NOT NULL,
  `explanation_image_url` varchar(1000) DEFAULT NULL,
  `marks` int DEFAULT '1',
  `order_index` int DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_test_questions_test` (`test_id`),
  CONSTRAINT `fk_test_questions_test` FOREIGN KEY (`test_id`) REFERENCES `tests` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `test_questions`
--

LOCK TABLES `test_questions` WRITE;
/*!40000 ALTER TABLE `test_questions` DISABLE KEYS */;
/*!40000 ALTER TABLE `test_questions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `test_quiz_drafts`
--

DROP TABLE IF EXISTS `test_quiz_drafts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `test_quiz_drafts` (
  `draft_id` bigint NOT NULL AUTO_INCREMENT,
  `test_id` bigint NOT NULL,
  `draft_payload` json NOT NULL,
  `version` int unsigned NOT NULL DEFAULT '1',
  `created_by` bigint NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL,
  `deleted_by` bigint DEFAULT NULL,
  `materialized_at` timestamp NULL DEFAULT NULL,
  `materialized_version` int unsigned DEFAULT NULL,
  PRIMARY KEY (`draft_id`),
  UNIQUE KEY `uq_test_quiz_drafts_test_id` (`test_id`),
  KEY `idx_test_quiz_drafts_created_by` (`created_by`),
  KEY `idx_test_quiz_drafts_updated_at` (`updated_at`),
  KEY `idx_test_quiz_drafts_deleted_at` (`deleted_at`),
  KEY `fk_tqd_deleted_by` (`deleted_by`),
  CONSTRAINT `fk_tqd_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_tqd_deleted_by` FOREIGN KEY (`deleted_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_tqd_test` FOREIGN KEY (`test_id`) REFERENCES `tests` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chk_tqd_version_positive` CHECK ((`version` >= 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `test_quiz_drafts`
--

LOCK TABLES `test_quiz_drafts` WRITE;
/*!40000 ALTER TABLE `test_quiz_drafts` DISABLE KEYS */;
/*!40000 ALTER TABLE `test_quiz_drafts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `test_results`
--

DROP TABLE IF EXISTS `test_results`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `test_results` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `attempt_id` bigint NOT NULL,
  `score` int NOT NULL,
  `max_score` int NOT NULL,
  `percentage` decimal(5,2) NOT NULL,
  `correct_count` int NOT NULL DEFAULT '0',
  `wrong_count` int NOT NULL DEFAULT '0',
  `skipped_count` int NOT NULL DEFAULT '0',
  `time_taken_seconds` int NOT NULL DEFAULT '0',
  `detail_json` json NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `attempt_id` (`attempt_id`),
  CONSTRAINT `fk_result_attempt` FOREIGN KEY (`attempt_id`) REFERENCES `test_attempts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `test_results`
--

LOCK TABLES `test_results` WRITE;
/*!40000 ALTER TABLE `test_results` DISABLE KEYS */;
/*!40000 ALTER TABLE `test_results` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `test_subjects`
--

DROP TABLE IF EXISTS `test_subjects`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `test_subjects` (
  `test_id` bigint NOT NULL,
  `subject_id` bigint NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`test_id`,`subject_id`),
  KEY `idx_test_subjects_subject` (`subject_id`),
  CONSTRAINT `fk_test_subjects_subject` FOREIGN KEY (`subject_id`) REFERENCES `subjects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_test_subjects_test` FOREIGN KEY (`test_id`) REFERENCES `tests` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `test_subjects`
--

LOCK TABLES `test_subjects` WRITE;
/*!40000 ALTER TABLE `test_subjects` DISABLE KEYS */;
/*!40000 ALTER TABLE `test_subjects` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `tests`
--

DROP TABLE IF EXISTS `tests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tests` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `course_id` bigint DEFAULT NULL,
  `title` varchar(220) NOT NULL,
  `description` text,
  `subject` varchar(80) NOT NULL,
  `category` varchar(80) DEFAULT NULL,
  `duration_minutes` int NOT NULL,
  `passing_marks` decimal(8,2) NOT NULL DEFAULT '0.00',
  `max_attempts` int DEFAULT '1',
  `negative_marking` decimal(6,2) NOT NULL DEFAULT '0.00',
  `shuffle_questions` tinyint(1) DEFAULT '0',
  `shuffle_options` tinyint(1) DEFAULT '0',
  `show_explanations` tinyint(1) DEFAULT '1',
  `access_mode` enum('private','public') NOT NULL DEFAULT 'private',
  `tags_json` json DEFAULT NULL,
  `status` enum('draft','published','archived') DEFAULT 'draft',
  `public_slug` varchar(180) DEFAULT NULL,
  `created_by` bigint DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `public_slug` (`public_slug`),
  UNIQUE KEY `idx_tests_public_slug` (`public_slug`),
  KEY `idx_tests_course` (`course_id`),
  CONSTRAINT `fk_tests_course` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `tests`
--

LOCK TABLES `tests` WRITE;
/*!40000 ALTER TABLE `tests` DISABLE KEYS */;
/*!40000 ALTER TABLE `tests` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `email` varchar(255) NOT NULL,
  `username` varchar(50) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `full_name` varchar(120) NOT NULL,
  `is_verified` tinyint(1) NOT NULL DEFAULT '0',
  `last_verification_sent_at` timestamp NULL DEFAULT NULL,
  `verification_send_failures` int NOT NULL DEFAULT '0',
  `token_version` int NOT NULL DEFAULT '0',
  `risk_level` enum('normal','elevated','critical') NOT NULL DEFAULT 'normal',
  `role` enum('student','teacher','admin','super_admin') NOT NULL DEFAULT 'student',
  `status` enum('active','inactive','suspended') NOT NULL DEFAULT 'active',
  `learning_streak_count` int NOT NULL DEFAULT '0',
  `learning_streak_last_date` date DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Temporary view structure for view `vw_course_enrollment_status`
--

DROP TABLE IF EXISTS `vw_course_enrollment_status`;
/*!50001 DROP VIEW IF EXISTS `vw_course_enrollment_status`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `vw_course_enrollment_status` AS SELECT 
 1 AS `id`,
 1 AS `title`,
 1 AS `description`,
 1 AS `start_date`,
 1 AS `end_date`,
 1 AS `admission_status`,
 1 AS `is_enrollment_open`,
 1 AS `enrollment_message`*/;
SET character_set_client = @saved_cs_client;

--
-- Final view structure for view `vw_course_enrollment_status`
--

/*!50001 DROP VIEW IF EXISTS `vw_course_enrollment_status`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_unicode_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`mrb_app`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `vw_course_enrollment_status` AS select `courses`.`id` AS `id`,`courses`.`title` AS `title`,`courses`.`description` AS `description`,`courses`.`start_date` AS `start_date`,`courses`.`end_date` AS `end_date`,`courses`.`admission_status` AS `admission_status`,(case when (`courses`.`admission_status` = 'OPEN') then true else false end) AS `is_enrollment_open`,(case when (`courses`.`admission_status` = 'OPEN') then 'Enrollment is open' else 'Admissions are currently closed.' end) AS `enrollment_message` from `courses` */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-25 18:52:56
